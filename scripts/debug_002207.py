
import sys
import os
import pandas as pd
import akshare as ak
import yfinance as yf
from datetime import datetime, timedelta

# Disable proxies
os.environ['HTTP_PROXY'] = ''
os.environ['HTTPS_PROXY'] = ''
os.environ['ALL_PROXY'] = ''
os.environ['NO_PROXY'] = '*'

def analyze_fund_002207():
    fund_code = "002207"
    target_date = "2026-02-03" # Tuesday
    
    print(f"🕵️‍♂️ Analyzing Discrepancy for Fund {fund_code} on {target_date}")
    
    # 1. Get Holdings
    try:
        last_year = str(datetime.now().year - 1)
        df = ak.fund_portfolio_hold_em(symbol=fund_code, date=last_year)
        # Sort by quarter
        latest_quarter = sorted(df['季度'].unique(), reverse=True)[0]
        latest_df = df[df['季度'] == latest_quarter]
        print(f"📊 Holdings Report: {latest_quarter}")
    except Exception as e:
        print(f"Error fetching holdings: {e}")
        return

    # 2. Prepare Tickers
    tickers = []
    mapping = {}
    for _, row in latest_df.iterrows():
        code = str(row['股票代码'])
        name = str(row['股票名称'])
        weight = float(row['占净值比例'])
        
        yf_code = code
        if code[0] in ['6', '9']: yf_code = code + ".SS"
        elif code[0] in ['0', '3']: yf_code = code + ".SZ"
        elif code[0] in ['4', '8']: yf_code = code + ".BJ"
        
        tickers.append(yf_code)
        mapping[yf_code] = {'name': name, 'weight': weight, 'code': code}
        
    # 3. Fetch Prices
    start = "2026-01-25" # Lunar New Year might affect this? 
    # Wait, Feb 2026. Lunar New Year 2026 is Feb 17. So Feb 3 is normal.
    # But wait, 2026-01-01 is Thursday.
    # Feb 3 2026 is Tuesday.
    # Feb 2 is Monday.
    
    print(f"📅 Fetching prices for {tickers}...")
    data = yf.download(tickers, start="2026-01-30", end="2026-02-05", progress=False)['Close']
    data.index = data.index.strftime('%Y-%m-%d')
    
    if target_date not in data.index:
        print(f"❌ Missing data for target date {target_date}")
        print("Available:", data.index.tolist())
        return

    # 4. Analyze Components
    idx = data.index.get_loc(target_date)
    today = data.iloc[idx]
    prev = data.iloc[idx-1]
    prev_date = data.index[idx-1]
    
    print(f"\nTime Window: {prev_date} -> {target_date}")
    print(f"{'Stock':<10} {'Name':<10} {'Weight':<8} {'Prev':<8} {'Close':<8} {'Chg(%)':<8} {'Impact':<8}")
    print("-" * 80)
    
    total_impact = 0
    total_weight = 0
    
    for yf_code, item in mapping.items():
        try:
            p0 = prev[yf_code]
            p1 = today[yf_code]
            
            pct = 0
            if not pd.isna(p0) and not pd.isna(p1) and p0 > 0:
                pct = ((p1 - p0) / p0) * 100
            
            impact = pct * (item['weight'] / 100.0)
            total_impact += impact
            total_weight += item['weight']
            
            print(f"{item['code']:<10} {item['name']:<10} {item['weight']:<8.2f} {p0:<8.2f} {p1:<8.2f} {pct:<8.2f} {impact:<8.4f}")
        except:
            print(f"Error for {yf_code}")
            
    estim = total_impact * (100/total_weight) if total_weight > 0 else 0
    print("-" * 80)
    print(f"Total Weight: {total_weight:.2f}%")
    print(f"Raw Impact: {total_impact:.4f}%")
    print(f"Estimated NAV Chg: {estim:.2f}%")

if __name__ == "__main__":
    analyze_fund_002207()
