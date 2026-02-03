import os
# Force disable proxy to avoid system proxy settings interfering
os.environ['HTTP_PROXY'] = ''
os.environ['HTTPS_PROXY'] = ''
os.environ['ALL_PROXY'] = ''
os.environ['NO_PROXY'] = '*'

import akshare as ak
import pandas as pd
import time
from datetime import datetime

def get_holdings(fund_code):
    print(f"🔍 正在获取基金 {fund_code} 的最新季报持仓 (Source: AkShare)...")
    try:
        # 东方财富接口：获取基金持仓
        # fun_portfolio_hold_em(symbol="...", date="...")
        current_year = str(datetime.now().year)
        # 尝试当年，如果没有则尝试去年的（年初可能还没有当年的年报/季报）
        # 但是 akshare 这个接口好像是按年返回该年所有季度的。
        try:
            df = ak.fund_portfolio_hold_em(symbol=fund_code, date=current_year)
            if df.empty:
               last_year = str(datetime.now().year - 1) 
               df = ak.fund_portfolio_hold_em(symbol=fund_code, date=last_year)
        except:
             # Fallback to last year directly if current year fails violently
             last_year = str(datetime.now().year - 1)
             df = ak.fund_portfolio_hold_em(symbol=fund_code, date=last_year)
        
        if df.empty:
            return []
            
        # 找到最近的报告期
        latest_quarter = df['季度'].iloc[0]
        print(f"📅 最新报告期: {latest_quarter}")
        
        # 筛选最新季度的数据
        latest_df = df[df['季度'] == latest_quarter]
        
        holdings = []
        for _, row in latest_df.iterrows():
            holdings.append({
                'code': str(row['股票代码']),
                'name': str(row['股票名称']),
                'weight': float(row['占净值比例'])
            })
        print(f"✅ 获取到 {len(holdings)} 条持仓记录:")
        for h in holdings:
            print(f"   - {h['code']} {h['name']}: {h['weight']}%")
        return holdings
    except Exception as e:
        print(f"❌ 获取持仓失败: {e}")
        return []

def get_realtime_quotes(stock_codes):
    """
    获取 A 股实时行情 (Switched to yfinance for better reliability).
    """
    import yfinance as yf
    print(f"📈 正在拉取 {len(stock_codes)} 只股票的实时行情 (Source: Yahoo Finance)...")
    
    # Convert to Yahoo tickers
    yf_tickers = []
    mapping = {} # yf_ticker -> original_code
    
    for code in stock_codes:
        yf_code = code
        if len(code) == 6:
            suffix = ".SS" if code.startswith("6") else ".SZ"
            if code.startswith("4") or code.startswith("8"): suffix = ".BJ"
            yf_code = code + suffix
        elif len(code) == 5:
            # Hong Kong Stocks (e.g. 09988 -> 9988.HK)
            yf_code = str(int(code)) + ".HK"
            
        yf_tickers.append(yf_code)
        mapping[yf_code] = code
        
    try:
        # Batch fetch
        tickers = yf.Tickers(" ".join(yf_tickers))
        quote_map = {}
        
        for yf_code in yf_tickers:
            try:
                # Try fast_info first (realtimeish)
                ticker = tickers.tickers[yf_code]
                price = ticker.fast_info.last_price
                prev_close = ticker.fast_info.previous_close
                
                if price and prev_close:
                    pct = ((price - prev_close) / prev_close) * 100
                    orig_code = mapping[yf_code]
                    quote_map[orig_code] = pct
                else:
                    # Fallback to history
                    hist = ticker.history(period="1d")
                    if not hist.empty:
                        # Ensure we calculate change correctly relative to prev close
                        # This might be just today's close if market closed, or current price
                        # Let's approximate
                        close = hist['Close'].iloc[-1]
                        # We need open or prev close. 
                        # This path is less accurate for realtime change % if we don't know prev close
                        # But fast_info usually works.
                        pass
            except Exception as e:
                # print(f"  - Failed {yf_code}: {e}")
                pass
            
        return quote_map
    except Exception as e:
        print(f"❌ 获取行情失败: {e}")
        return {}

def estimate_valuation(fund_code):
    # 1. 获取持仓
    holdings = get_holdings(fund_code)
    if not holdings:
        print("未找到持仓数据。")
        return

    # 2. 获取实时行情
    # 提取所有股票代码
    stock_codes = [h['code'] for h in holdings]
    quote_map = get_realtime_quotes(stock_codes)
    
    if not quote_map:
        print("无法获取行情，估算终止。")
        return
    
    total_estimated_change = 0.0
    total_weight = 0.0
    
    print("\n" + "=" * 65)
    print(f"{'代码':<8} {'名称':<10} {'权重(%)':<10} {'实时涨跌(%)':<12} {'贡献度(%)':<10}")
    print("-" * 65)
    
    for stock in holdings:
        code = stock['code']
        weight = stock['weight']
        
        # 在全市场行情中查找
        change = quote_map.get(code)
        
        if change is None:
            # 可能是港股通或其他市场，暂且记为0，或打印警告
            change = 0.0
            note = "(无行情)"
        else:
            note = ""
            
        # 贡献度 calculation: 涨跌幅 * (权重 / 100)
        impact = change * (weight / 100.0)
        
        total_estimated_change += impact
        total_weight += weight
        
        print(f"{code:<8} {stock['name']:<10} {weight:<10.2f} {str(change)+note:<12} {impact:<10.4f}")

    print("-" * 65)
    
    # 3. 净值估算逻辑
    # 模型: 假设非重仓股(及现金部分)的平均涨跌幅 = 重仓股的加权平均涨跌幅
    # 即: 线性归一化
    
    final_est = 0.0
    if total_weight > 0:
        final_est = total_estimated_change * (100 / total_weight)
    
    print(f"\n📊 统计结果:")
    print(f"   前十大重仓总权重: {total_weight:.2f}%")
    print(f"   重仓股加权涨幅  : {total_estimated_change:.4f}%")
    print(f"   🚀 预估基金净值涨幅: {final_est:.2f}% (线性归一化)")
    print("=" * 65)

if __name__ == "__main__":
    # 示例: 易方达蓝筹精选 (张坤)
    target_fund = "022365" # 永赢科技智选混合发起C 
    print(f"正在估算基金: {target_fund} ...")
    estimate_valuation(target_fund)
