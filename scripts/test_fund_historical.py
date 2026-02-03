import os
# Force disable proxy
os.environ['HTTP_PROXY'] = ''
os.environ['HTTPS_PROXY'] = ''
os.environ['ALL_PROXY'] = ''
os.environ['NO_PROXY'] = '*'

import akshare as ak
import pandas as pd
import yfinance as yf
from datetime import datetime, timedelta

def get_holdings(fund_code):
    print(f"🔍 获取基金 {fund_code} 持仓...")
    try:
        # 1. 总是先尝试获取上一年的数据 (因为当年Q1通常在4月才出，年初只能看去年的Q4)
        # 例如现在是 2026年2月，我们应该找 2025年的数据
        last_year = str(datetime.now().year - 1) 
        df = ak.fund_portfolio_hold_em(symbol=fund_code, date=last_year)
        
        if df.empty:
            # 如果去年的也没有(比如新基金)，尝试当年的
            current_year = str(datetime.now().year)
            df = ak.fund_portfolio_hold_em(symbol=fund_code, date=current_year)
            
        if df.empty: return []
        
        # 2. 关键修复：必须取 '季度' 最大的那一个 (即最新的报告)
        # 现在的 df 包含该年所有季度的数据
        # AkShare 返回的 '季度' 列通常是 "2025年1季度股票投资明细", "2025年4季度..." 字符串
        # 我们对其进行排序
        
        # 提取季度名称用于排序
        all_quarters = df['季度'].unique()
        # sort logic: "2025年4季度" > "2025年1季度"
        latest_quarter = sorted(all_quarters, reverse=True)[0]
        
        print(f"📅 锁定最新持仓报告: {latest_quarter}")
        
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
        print(f"❌ Error: {e}")
        return []

def calculate_historical_val(fund_code, target_date_str):
    """
    Calculate valuation for a specific past date.
    target_date_str: 'YYYY-MM-DD' (e.g., '2026-02-02')
    """
    holdings = get_holdings(fund_code)
    if not holdings: return

    print(f"\n📅 计算日期: {target_date_str}")
    
    # 1. Prepare Tickers
    yf_tickers = []
    mapping = {} 
    
    for h in holdings:
        code = h['code']
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
    
    # 2. Fetch History (Target Date + Previous Trading Day)
    # We fetch a range to ensure we find the target day and its predecessor
    start_date = (datetime.strptime(target_date_str, "%Y-%m-%d") - timedelta(days=5)).strftime("%Y-%m-%d")
    end_date = (datetime.strptime(target_date_str, "%Y-%m-%d") + timedelta(days=2)).strftime("%Y-%m-%d")
    
    print(f"📈 拉取历史数据 ({start_date} ~ {end_date})...")
    
    data = yf.download(yf_tickers, start=start_date, end=end_date, progress=False)['Close']
    
    # Check if target date exists in data
    # yfinance index is datetime
    res_data = [] # To print table
    
    total_impact = 0.0
    total_weight = 0.0
    
    print("\n" + "=" * 80)
    print(f"{'代码':<10} {'名称':<10} {'收盘价(T)':<10} {'涨幅(%)':<10} {'权重(%)':<10} {'贡献(%)':<10}")
    print("-" * 80)
    
    target_ts = pd.Timestamp(target_date_str).tz_localize(None) # naive for comparison if needed, or just string match
    
    # Find the row for target date
    # Data index might be UTC or Local. Convert to string YYYY-MM-DD for matching
    data.index = data.index.strftime('%Y-%m-%d')
    
    if target_date_str not in data.index:
        print(f"❌ 错误: 无法找到 {target_date_str} 的交易数据 (可能是休市或数据缺失)")
        print(f"可用日期: {data.index.tolist()}")
        return

    # Find row index
    idx = data.index.get_loc(target_date_str)
    if idx == 0:
         print(f"❌ 错误: {target_date_str} 是数据的第一天，无法计算涨跌幅")
         return
         
    # Calculate change
    today_prices = data.iloc[idx]
    prev_prices = data.iloc[idx-1]
    
    for yf_code, h in mapping.items():
        try:
            p_close = today_prices[yf_code]
            p_prev = prev_prices[yf_code]
            
            if pd.isna(p_close) or pd.isna(p_prev):
                pct = 0.0
                note = "(缺失)"
            else:
                pct = ((p_close - p_prev) / p_prev) * 100
                note = ""
            
            impact = pct * (h['weight'] / 100.0)
            total_impact += impact
            total_weight += h['weight']
            
            print(f"{h['code']:<10} {h['name']:<10} {p_close:<10.2f} {pct:<10.2f} {h['weight']:<10.2f} {impact:<10.4f}")
            
        except Exception as e:
            print(f"Err {yf_code}: {e}")

    print("-" * 80)
    
    final_est = total_impact * (100 / total_weight) if total_weight > 0 else 0
    
    print(f"\n📊 {target_date_str} 估值复盘:")
    print(f"   前十大重仓权重: {total_weight:.2f}%")
    print(f"   重仓股贡献涨幅: {total_impact:.4f}%")
    print(f"   🚀 估算基金净值涨幅: {final_est:.2f}%")
    print("=" * 80)

if __name__ == "__main__":
    import sys
    fund = "022365"
    date_str = "2026-02-02"
    
    if len(sys.argv) >= 2:
        fund = sys.argv[1]
    if len(sys.argv) >= 3:
        date_str = sys.argv[2]
        
    print(f"Running valuation for {fund} on {date_str}...")
    calculate_historical_val(fund, date_str)
