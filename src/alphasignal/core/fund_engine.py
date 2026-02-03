import os
import akshare as ak
import pandas as pd
import yfinance as yf
import json
import redis
from datetime import datetime, timedelta
from src.alphasignal.core.database import IntelligenceDB
from src.alphasignal.core.logger import logger

class FundEngine:
    def __init__(self, db: IntelligenceDB = None):
        self.db = db if db else IntelligenceDB()
        
        # Init Redis
        redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
        try:
            self.redis = redis.from_url(redis_url, decode_responses=True)
            # Lightweight check (optional)
        except Exception as e:
            logger.warning(f"Redis connection failed: {e}")
            self.redis = None

    def update_fund_holdings(self, fund_code):
        # ... (keep existing implementation of update_fund_holdings) ...
        """Fetch latest holdings from AkShare and save to DB."""
        logger.info(f"🔍 Fetching holdings for fund: {fund_code}")
        
        # Temporary disable proxy for AkShare (EastMoney often fails with proxies)
        original_http = os.environ.get('HTTP_PROXY')
        original_https = os.environ.get('HTTPS_PROXY')
        os.environ['HTTP_PROXY'] = ''
        os.environ['HTTPS_PROXY'] = ''
        
        try:
            # 1. Try last year first (most common case)
            last_year = str(datetime.now().year - 1)
            try:
                df = ak.fund_portfolio_hold_em(symbol=fund_code, date=last_year)
            except:
                df = pd.DataFrame()
            
            if df.empty:
                current_year = str(datetime.now().year)
                try:
                    df = ak.fund_portfolio_hold_em(symbol=fund_code, date=current_year)
                except:
                    pass
                
            if df.empty:
                logger.warning(f"No holdings found for {fund_code}")
                return []
            
            # 2. Sort by quarter to get truly latest
            all_quarters = df['季度'].unique()
            if len(all_quarters) == 0: return []
            
            latest_quarter = sorted(all_quarters, reverse=True)[0]
            logger.info(f"📅 Latest Report: {latest_quarter}")
            
            latest_df = df[df['季度'] == latest_quarter]
            
            holdings = []
            for _, row in latest_df.iterrows():
                holdings.append({
                    'code': str(row['股票代码']),
                    'name': str(row['股票名称']),
                    'weight': float(row['占净值比例']),
                    'report_date': latest_quarter
                })
                
            # Save to DB
            self.db.save_fund_holdings(fund_code, holdings)
            return holdings
            
        except Exception as e:
            logger.error(f"Update Holdings Failed: {e}")
            return []
        finally:
            # Restore proxy if needed (skipped for now as per previous logic)
            pass

    def _get_fund_name(self, fund_code):
        """Fetch Fund Name with Redis Cache."""
        if self.redis:
            cached_name = self.redis.get(f"fund:name:{fund_code}")
            if cached_name: return cached_name
            
        fund_name = ""
        try:
            # Use Xueqiu API for single fund info
            # Force disable proxy for AkShare
            if "HTTP_PROXY" in os.environ: del os.environ["HTTP_PROXY"]
            if "HTTPS_PROXY" in os.environ: del os.environ["HTTPS_PROXY"]
            
            info_df = ak.fund_individual_basic_info_xq(symbol=fund_code)
            # Usually row 1 is '基金简称'
            fund_name = info_df[info_df.iloc[:,0] == '基金简称'].iloc[0,1]
            
            if self.redis and fund_name:
                self.redis.setex(f"fund:name:{fund_code}", 86400 * 7, fund_name) # 7 days
                
        except:
            pass
        return fund_name

    def calculate_realtime_valuation(self, fund_code):
        """Calculate live estimated NAV growth based on holdings."""
        # 0. Check Cache
        if self.redis:
            cached_val = self.redis.get(f"fund:valuation:{fund_code}")
            if cached_val:
                logger.info(f"⚡️ Using cached valuation for {fund_code}")
                return json.loads(cached_val)
        
        # Force disable proxy for reliability
        for k in ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "all_proxy", "ALL_PROXY"]:
            if k in os.environ: del os.environ[k]
        os.environ["NO_PROXY"] = "*"

        # 1. Get Holdings from DB
        holdings = self.db.get_fund_holdings(fund_code)
        
        # If no holdings in DB, try to fetch
        if not holdings:
            holdings = self.update_fund_holdings(fund_code)
            
        if not holdings:
            return {"error": "No holdings data"}
            
        logger.info(f"📈 Calculating valuation for {fund_code} ({len(holdings)} stocks)")

        # 2. Get Realtime Quotes via Yahoo Finance
        yf_tickers = []
        mapping = {} 
        
        for h in holdings:
            code = h['stock_code']
            yf_code = code
            if len(code) == 6:
                suffix = ".SS" if code.startswith("6") else ".SZ"
                if code.startswith("4") or code.startswith("8"): suffix = ".BJ"
                yf_code = code + suffix
            elif len(code) == 5:
                # HK
                yf_code = str(int(code)) + ".HK"
            
            yf_tickers.append(yf_code)
            mapping[yf_code] = h
            
        try:
            tickers = yf.Tickers(" ".join(yf_tickers))
            total_impact = 0.0
            total_weight = 0.0
            components = []
            
            # Iterate and fetch
            for yf_code in yf_tickers:
                try:
                    ticker = tickers.tickers[yf_code]
                    # Try fast info
                    price = ticker.fast_info.last_price
                    prev_close = ticker.fast_info.previous_close
                    
                    if price and prev_close:
                        pct = ((price - prev_close) / prev_close) * 100
                    else:
                        # Fallback
                        hist = ticker.history(period="1d")
                        if not hist.empty:
                             pct = 0.0 # Simplified fallback
                        else:
                             pct = 0.0
                            
                    stock_data = mapping[yf_code]
                    weight = stock_data['weight']
                    impact = pct * (weight / 100.0)
                    
                    total_impact += impact
                    total_weight += weight
                    
                    components.append({
                        "code": stock_data['stock_code'],
                        "name": stock_data['stock_name'],
                        "price": price if price else 0.0,
                        "change_pct": pct,
                        "impact": impact,
                        "weight": weight
                    })
                    
                except Exception as e:
                    pass
            
            # 3. Normalize
            final_est = 0.0
            if total_weight > 0:
                final_est = total_impact * (100 / total_weight)
            
            # Fetch Fund Name (Lazy fetch with Cache)
            fund_name = self._get_fund_name(fund_code)

            result = {
                "fund_code": fund_code,
                "fund_name": fund_name,
                "estimated_growth": round(final_est, 4),
                "total_weight": total_weight,
                "components": components, # detailed attribution
                "timestamp": datetime.now().isoformat()
            }
            
            # Save to DB history
            try:
                self.db.save_fund_valuation(fund_code, final_est, result)
            except: pass
            
            # Set Cache (180s expire - optimized for watchlist switching)
            if self.redis:
                self.redis.setex(f"fund:valuation:{fund_code}", 180, json.dumps(result))
            
            return result
            
        except Exception as e:
            logger.error(f"Valuation Calc Failed: {e}")
            return {"error": str(e)}

    def search_funds(self, query: str, limit: int = 20):
        """
        Search for funds by code or name using akshare.
        
        Args:
            query: Search query (fund code or name)
            limit: Maximum number of results to return
            
        Returns:
            List of fund dictionaries with code, name, type, and company
        """
        # Check cache first (24 hour TTL for fund list)
        cache_key = f"fund:search:{query.lower()}"
        if self.redis:
            try:
                cached = self.redis.get(cache_key)
                if cached:
                    logger.info(f"[Cache Hit] Fund search: {query}")
                    return json.loads(cached)
            except Exception as e:
                logger.warning(f"Redis cache read failed: {e}")
        
        try:
            logger.info(f"🔍 Searching funds: {query}")
            
            # Disable proxy for akshare
            original_http = os.environ.get('HTTP_PROXY')
            original_https = os.environ.get('HTTPS_PROXY')
            os.environ['HTTP_PROXY'] = ''
            os.environ['HTTPS_PROXY'] = ''
            
            try:
                # Get all open-end funds from akshare
                # fund_name_em returns all fund codes and names
                df = ak.fund_name_em()
                
                # Restore proxy
                if original_http:
                    os.environ['HTTP_PROXY'] = original_http
                if original_https:
                    os.environ['HTTPS_PROXY'] = original_https
                
                if df.empty:
                    logger.warning("akshare returned empty dataframe")
                    return []
                
                # Log available columns for debugging
                logger.info(f"Available columns: {df.columns.tolist()}")
                
                # Detect column names (akshare may use different names)
                code_col = None
                name_col = None
                type_col = None
                company_col = None
                
                for col in df.columns:
                    col_lower = col.lower()
                    if '代码' in col or 'code' in col_lower:
                        code_col = col
                    elif '名称' in col or '简称' in col or 'name' in col_lower:
                        name_col = col
                    elif '类型' in col or 'type' in col_lower:
                        type_col = col
                    elif '管理人' in col or '公司' in col or 'company' in col_lower:
                        company_col = col
                
                if not code_col or not name_col:
                    logger.error(f"Cannot find code/name columns in: {df.columns.tolist()}")
                    return []
                
                # Filter by query (code or name)
                q = query.lower()
                mask = (
                    df[code_col].astype(str).str.contains(q, case=False, na=False) |
                    df[name_col].astype(str).str.contains(q, case=False, na=False)
                )
                filtered = df[mask].head(limit)
                
                # Format results
                results = []
                for _, row in filtered.iterrows():
                    results.append({
                        'code': str(row[code_col]),
                        'name': str(row[name_col]),
                        'type': str(row[type_col]) if type_col and type_col in row else '混合型',
                        'company': str(row[company_col]) if company_col and company_col in row else ''
                    })
                
                logger.info(f"Found {len(results)} results for query: {query}")
                
                # Cache results for 24 hours
                if self.redis and results:
                    try:
                        self.redis.setex(cache_key, 86400, json.dumps(results))
                    except Exception as e:
                        logger.warning(f"Redis cache write failed: {e}")
                
                return results
                
            except Exception as e:
                # Restore proxy on error
                if original_http:
                    os.environ['HTTP_PROXY'] = original_http
                if original_https:
                    os.environ['HTTPS_PROXY'] = original_https
                raise e
                
        except Exception as e:
            logger.error(f"Fund search failed: {e}")
            return []
