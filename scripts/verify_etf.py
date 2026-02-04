
import yfinance as yf
import pandas as pd
import os

os.environ['HTTP_PROXY'] = ''
os.environ['HTTPS_PROXY'] = ''
os.environ['ALL_PROXY'] = ''
os.environ['NO_PROXY'] = '*'

def check_etf_performance():
    # 515050: 5G ETF (Target for 023765, Act: 2.27%)
    # 516120: Chemical ETF (Target for 020274, Act: 3.7%)
    
    etfs = {
        '515050.SS': '5G ETF',
        '516120.SS': 'Chemical ETF'
    }
    
    print("Fetching ETF prices for 2026-02-03...")
    data = yf.download(list(etfs.keys()), start="2026-02-01", end="2026-02-05", progress=False)['Close']
    data.index = data.index.strftime('%Y-%m-%d')
    
    target_date = "2026-02-03"
    if target_date not in data.index:
        print("Date not found.")
        return
        
    idx = data.index.get_loc(target_date)
    today = data.iloc[idx]
    prev = data.iloc[idx-1]
    
    for code, name in etfs.items():
        p1 = today[code]
        p0 = prev[code]
        pct = (p1 - p0) / p0 * 100
        print(f"{name} ({code}): {pct:.2f}%")

if __name__ == "__main__":
    check_etf_performance()
