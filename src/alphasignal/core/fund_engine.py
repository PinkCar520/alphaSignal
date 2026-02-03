import os
import akshare as ak
import pandas as pd
import yfinance as yf
from datetime import datetime, timedelta
from src.alphasignal.core.database import IntelligenceDB
from src.alphasignal.core.logger import logger

class FundEngine:
    def __init__(self, db: IntelligenceDB = None):
        self.db = db if db else IntelligenceDB()

    def update_fund_holdings(self, fund_code):
        """Fetch latest holdings from AkShare and save to DB."""
        logger.info(f"🔍 Fetching holdings for fund: {fund_code}")
        
        # Temporary disable proxy for AkShare (EastMoney often fails with proxies)
        # We save original values to restore if needed, or just keep them unset for this thread
        original_http = os.environ.get('HTTP_PROXY')
        original_https = os.environ.get('HTTPS_PROXY')
        os.environ['HTTP_PROXY'] = ''
        os.environ['HTTPS_PROXY'] = ''
        
        try:
            # 1. Try last year first (most common case for early in the year)
            last_year = str(datetime.now().year - 1)
            try:
                df = ak.fund_portfolio_hold_em(symbol=fund_code, date=last_year)
            except:
                df = pd.DataFrame()
            
            if df.empty:
                # Try current year
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

    def calculate_realtime_valuation(self, fund_code):
        """Calculate live estimated NAV growth based on holdings."""
        # Force disable proxy for reliability (matching test script)
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
                            # This is rough if market closed, but works for "today's move"
                            # We strictly need (Now - PrevClose) / PrevClose
                            # If market is closed, this might show yesterday's move or 0? 
                            # Yahoo fast_info usually retains last session data.
                            # For precision, let's assume 0 if missing to avoid noise
                             pct = 0.0
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
                        "price": price,
                        "change_pct": pct,
                        "impact": impact,
                        "weight": weight
                    })
                    
                except Exception as e:
                    # logger.warning(f"Quote failed for {yf_code}: {e}")
                    pass
            
            # 3. Normalize
            final_est = 0.0
            if total_weight > 0:
                final_est = total_impact * (100 / total_weight)
                
            result = {
                "fund_code": fund_code,
                "estimated_growth": round(final_est, 4),
                "total_weight": total_weight,
                "components": components, # detailed attribution
                "timestamp": datetime.now().isoformat()
            }
            
            # Save to DB history
            self.db.save_fund_valuation(fund_code, final_est, result)
            
            return result
            
        except Exception as e:
            logger.error(f"Valuation Calc Failed: {e}")
            return {"error": str(e)}
