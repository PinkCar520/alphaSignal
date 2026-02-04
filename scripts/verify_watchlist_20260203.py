
import sys
import os
import pandas as pd
import akshare as ak
import yfinance as yf
from datetime import datetime, timedelta
import time

# Set DB Credentials FIRST
os.environ['POSTGRES_USER'] = 'alphasignal'
os.environ['POSTGRES_PASSWORD'] = 'secure_password'
os.environ['POSTGRES_DB'] = 'alphasignal_core'
os.environ['POSTGRES_HOST'] = 'localhost'
os.environ['POSTGRES_PORT'] = '5432'

# Disable proxies
os.environ['HTTP_PROXY'] = ''
os.environ['HTTPS_PROXY'] = ''
os.environ['ALL_PROXY'] = ''
os.environ['NO_PROXY'] = '*'

# Add src to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src.alphasignal.core.database import IntelligenceDB

def get_watchlist():
    db = IntelligenceDB()
    # Assuming user_id='default', or fetch all
    return db.get_watchlist('default')

def get_holdings(fund_code):
    try:
        last_year = str(datetime.now().year - 1) 
        df = ak.fund_portfolio_hold_em(symbol=fund_code, date=last_year)
        
        if df.empty:
            current_year = str(datetime.now().year)
            df = ak.fund_portfolio_hold_em(symbol=fund_code, date=current_year)
            
        if df.empty: return []
        
        all_quarters = df['季度'].unique()
        if len(all_quarters) == 0: return []
        
        latest_quarter = sorted(all_quarters, reverse=True)[0]
        latest_df = df[df['季度'] == latest_quarter]
        
        holdings = []
        for _, row in latest_df.iterrows():
            holdings.append({
                'code': str(row['股票代码']),
                'name': str(row['股票名称']),
                'weight': float(row['占净值比例'])
            })
        return holdings
    except Exception as e:
        print(f"Error fetching holdings for {fund_code}: {e}")
        return []

def get_official_nav_change(fund_code, target_date):
    """
    Fetch official NAV change % from AkShare for a specific date.
    target_date: 'YYYY-MM-DD'
    """
    try:
        # Get history (start date slightly before to be safe, end date slightly after)
        start_date = (datetime.strptime(target_date, "%Y-%m-%d") - timedelta(days=5)).strftime("%Y%m%d")
        end_date = (datetime.strptime(target_date, "%Y-%m-%d") + timedelta(days=5)).strftime("%Y%m%d")
        
        df = ak.fund_nav_history_em(symbol=fund_code, start_date=start_date, end_date=end_date)
        
        # Filter (Column name might vary, usually '净值日期')
        # Standard columns from em: 净值日期, 单位净值, 累计净值, 日增长率
        
        # Convert date column to string YYYY-MM-DD
        # Depending on version it might be object or datetime
        df['净值日期'] = pd.to_datetime(df['净值日期']).dt.strftime('%Y-%m-%d')
        
        row = df[df['净值日期'] == target_date]
        if not row.empty:
            # '日增长率' often strings like '1.25%' or float
            raw = row.iloc[0]['日增长率']
            val = float(str(raw).replace('%', ''))
            return val
        return None
    except Exception as e:
        print(f"    Failed to get official NAV for {fund_code}: {e}")
        return None

def calculate_estimated_change(fund_code, target_date_str):
    holdings = get_holdings(fund_code)
    if not holdings:
        return None, 0.0, 0.0

    # Prepare tickers
    yf_tickers = []
    mapping = {} 
    
    for h in holdings:
        code = h['code']
        yf_code = code
        if len(code) == 6:
            suffix = ".SS" if code.startswith("6") else ".SZ"
            if code.startswith("4") or code.startswith("8") or code.startswith("9"): suffix = ".BJ" # 9xxx is usually rare/B-share? Assume BJ or SH. 688 is SH.
            # Fix: 6/9 -> SS, 0/3 -> SZ, 4/8 -> BJ
            if code[0] in ['6', '9']: suffix = ".SS"
            elif code[0] in ['0', '3']: suffix = ".SZ"
            elif code[0] in ['4', '8']: suffix = ".BJ"
            
            yf_code = code + suffix
        elif len(code) == 5 and code.isdigit():
            # HK
            yf_code = str(int(code)) + ".HK"
        else:
             # Likely US or other
             yf_code = code
        
        yf_tickers.append(yf_code)
        mapping[yf_code] = h
    
    # Fetch Data
    start_date = (datetime.strptime(target_date_str, "%Y-%m-%d") - timedelta(days=10)).strftime("%Y-%m-%d")
    end_date = (datetime.strptime(target_date_str, "%Y-%m-%d") + timedelta(days=3)).strftime("%Y-%m-%d")
    
    try:
        data = yf.download(yf_tickers, start=start_date, end=end_date, progress=False)['Close']
    except:
        return None, 0, 0
    
    if data.empty:
        return None, 0, 0
        
    # Convert index to YYYY-MM-DD
    data.index = data.index.strftime('%Y-%m-%d')
    
    if target_date_str not in data.index:
        # Maybe it's not a trading day?
        # print(f"    No data for {target_date_str}")
        return None, 0, 0
        
    idx = data.index.get_loc(target_date_str)
    if idx == 0:
        return None, 0, 0
        
    today_prices = data.iloc[idx]
    prev_prices = data.iloc[idx-1] # Logic assumes trading days are sequential in the DF
    
    total_impact = 0.0
    total_weight = 0.0
    
    for yf_code, h in mapping.items():
        try:
            # Handle potential MultiIndex columns if single ticker download behaves differently (rare with list)
            # data['Close'][yf_code] vs data[yf_code]
            # yfinance returns DataFrame with columns=Tickers if multiple
            # If single, columns=OHLCV.
            
            p_close = 0
            p_prev = 0
            
            if len(yf_tickers) == 1:
                # DF columns are Close, Open...
                p_close = today_prices
                p_prev = prev_prices
            else:
                p_close = today_prices[yf_code]
                p_prev = prev_prices[yf_code]
            
            if pd.isna(p_close) or pd.isna(p_prev) or p_prev == 0:
                pct = 0.0
            else:
                pct = ((p_close - p_prev) / p_prev) * 100
            
            impact = pct * (h['weight'] / 100.0)
            total_impact += impact
            total_weight += h['weight']
        except:
            pass
            
    final_est = total_impact * (100 / total_weight) if total_weight > 0 else 0
    return final_est, total_weight, total_impact

def main():
    target_date = "2026-02-03"
    print(f"🚀 Starting Valuation Verification for {target_date}...")
    
    watchlist = get_watchlist()
    if not watchlist:
        print("No funds in watchlist.")
        return

    results = []
    
    print(f"{'Code':<8} {'Name':<15} {'Weight':<8} {'Est(%)':<10} {'Active(%)':<10} {'Diff':<10}")
    print("-" * 70)
    
    for item in watchlist:
        code = item['fund_code']
        name = item['fund_name']
        
        # 1. Calc Estimate
        est, weight, impact = calculate_estimated_change(code, target_date)
        
        # 2. Get Actual
        actual = get_official_nav_change(code, target_date)
        
        diff = "N/A"
        if est is not None and actual is not None:
            diff = f"{est - actual:.2f}"
            
        est_str = f"{est:.2f}" if est is not None else "N/A"
        act_str = f"{actual:.2f}" if actual is not None else "N/A"
        
        print(f"{code:<8} {name[:12]:<15} {weight:<8.1f} {est_str:<10} {act_str:<10} {diff:<10}")
        
        results.append({
            "code": code, "name": name, "weight": weight, "est": est, "actual": actual, "diff": est - actual if (est and actual) else None
        })
        
    # Summary
    print("\n✅ Verification Complete.")
    
if __name__ == "__main__":
    main()
