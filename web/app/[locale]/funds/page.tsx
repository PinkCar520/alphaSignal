'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Search, RefreshCw, ArrowUp, ArrowDown, PieChart, X, Target, Scale, Anchor, AlertTriangle } from 'lucide-react';
import FundSearch from '@/components/FundSearch';

interface ComponentStock {
    code: string;
    name: string;
    price: number;
    change_pct: number;
    impact: number;
    weight: number;
}

interface FundValuation {
    fund_code: string;
    fund_name?: string;
    estimated_growth: number;
    total_weight: number;
    components: ComponentStock[];
    timestamp: string;
    source?: string;
}

interface WatchlistItem {
    code: string;
    name: string;
    estimated_growth?: number; // For sorting by daily performance
    previous_growth?: number; // For trend arrows (↑↓)
    source?: string; // For confidence indicators
}

export default function FundDashboard({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = React.use(params);
    const t = useTranslations('Funds');

    // State management - API Driven
    const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
    const [selectedFund, setSelectedFund] = useState<string>('');
    const [valuation, setValuation] = useState<FundValuation | null>(null);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [isWatchlistRefreshing, setIsWatchlistRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    // Client-side valuation cache
    const [valuationCache, setValuationCache] = useState<Map<string, { data: FundValuation, timestamp: number }>>(new Map());
    const CACHE_TTL = 3 * 60 * 1000;

    // Sorting state: 'desc' (default), 'asc', or 'none' (insertion order)
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc' | 'none'>('desc');


    // Load selected fund preference from local storage (UI preference only)
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('fund_selected');
            if (stored) setSelectedFund(stored);
        }
    }, []);

    // Unified batch fetch function
    const fetchBatchValuation = async (codes: string[]) => {
        if (codes.length === 0) return;

        try {
            const codesParam = codes.join(',');
            const res = await fetch(`/api/funds/batch-valuation?codes=${codesParam}`);
            const response = await res.json();

            if (response.data) {
                const fetchTime = new Date();

                // Update Cache
                setValuationCache(prev => {
                    const newCache = new Map(prev);
                    response.data.forEach((val: any) => {
                        if (val && !val.error && val.fund_code) {
                            newCache.set(val.fund_code, { data: val, timestamp: fetchTime.getTime() });
                        }
                    });
                    return newCache;
                });

                // Update Watchlist State
                setWatchlist(prev => prev.map(item => {
                    const val = response.data.find((v: any) => v.fund_code === item.code);
                    if (val && !val.error) {
                        return {
                            ...item,
                            previous_growth: item.estimated_growth,
                            estimated_growth: val.estimated_growth,
                            name: (val.fund_name && !item.name) ? val.fund_name : item.name,
                            source: val.source
                        };
                    }
                    return item;
                }));

                return response.data;
            }
        } catch (err) {
            console.error('Failed to fetch batch:', err);
        }
        return [];
    };

    // 1. Fetch Watchlist from API with Migration Logic
    const fetchWatchlist = async () => {
        try {
            const res = await fetch('/api/watchlist');
            const json = await res.json();
            if (json.data) {
                let currentWatchlist = json.data;

                // Check if we need to migrate from localStorage
                if (json.data.length === 0 && typeof window !== 'undefined') {
                    // ... Migration logic (simplified for brevity in this replacement, assume kept or effectively omitted if not changed? 
                    // Wait, I strictly replacing `fetchWatchlist` so I must include migration logic if I touch it.
                    // Actually I will target the `useEffect` removal first, then modify `fetchWatchlist`?
                    // No, I need to modify `fetchWatchlist` to call batch.

                    // Standard migration logic copy-paste
                    const localStored = localStorage.getItem('fund_watchlist');
                    if (localStored) {
                        try {
                            const parsed = JSON.parse(localStored);
                            if (parsed && parsed.length > 0) {
                                for (const item of parsed) {
                                    await fetch('/api/watchlist', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ code: item.code, name: item.name })
                                    });
                                }
                                const res2 = await fetch('/api/watchlist');
                                const json2 = await res2.json();
                                if (json2.data) {
                                    currentWatchlist = json2.data;
                                    localStorage.removeItem('fund_watchlist');
                                }
                            }
                        } catch (e) { }
                    }
                }

                setWatchlist(currentWatchlist);

                // --- OPTIMIZATION: Fetch Batch Valuation IMMEDIATELY ---
                if (currentWatchlist.length > 0) {
                    const codes = currentWatchlist.map((i: any) => i.code);
                    // We await this so cache is populated BEFORE we set selectedFund
                    // This prevents the single API call in the subsequent useEffect
                    await fetchBatchValuation(codes);
                }

                // Set initial selection if empty and no local pref
                if (currentWatchlist.length > 0 && !selectedFund && typeof window !== 'undefined') {
                    const pref = localStorage.getItem('fund_selected');
                    if (pref && currentWatchlist.some((i: any) => i.code === pref)) {
                        setSelectedFund(pref);
                    } else {
                        setSelectedFund(currentWatchlist[0].code);
                    }
                }
            }
        } catch (e) {
            console.error("Failed to fetch watchlist", e);
        }
    };

    useEffect(() => {
        fetchWatchlist();
    }, []);

    const fetchValuation = async (code: string) => {
        // Check cache first
        const cached = valuationCache.get(code);
        const now = Date.now();

        if (cached) {
            console.log(`[Cache Hit] Using cached data for ${code}`);
            setValuation(cached.data);
            setLastUpdated(new Date(cached.timestamp));
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`/api/funds/${code}/valuation`);
            const data = await res.json();
            if (data.error) {
                console.error(data.error);
                return;
            }

            // Update state
            setValuation(data);
            const fetchTime = new Date();
            setLastUpdated(fetchTime);

            // Update cache
            setValuationCache(prev => {
                const newCache = new Map(prev);
                newCache.set(code, { data, timestamp: fetchTime.getTime() });
                return newCache;
            });

            // Update watchlist with growth data for sorting and trend tracking
            setWatchlist(prev => prev.map(item => {
                if (item.code === code) {
                    return {
                        ...item,
                        previous_growth: item.estimated_growth, // Store current as previous
                        estimated_growth: data.estimated_growth, // Update with new value
                        source: data.source
                    };
                }
                return item;
            }));

            // Auto-update name in watchlist if found
            if (data.fund_name) {
                setWatchlist(prev => prev.map(item =>
                    item.code === code && !item.name ? { ...item, name: data.fund_name } : item
                ));
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedFund) {
            fetchValuation(selectedFund);
        }
    }, [selectedFund]);





    // Persist selected fund to localStorage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem('fund_selected', selectedFund);
            } catch (e) {
                console.error('Failed to save selected fund to localStorage:', e);
            }
        }
    }, [selectedFund]);

    // Auto refresh every 3 minutes (matching cache TTL)


    // Manual refresh for the entire watchlist
    const handleWatchlistRefresh = async () => {
        if (watchlist.length === 0 || isWatchlistRefreshing) return;

        setIsWatchlistRefreshing(true);
        const codesToFetch = watchlist.map(item => item.code);

        try {
            const codesParam = codesToFetch.join(',');
            // Force refresh with timestamp
            const res = await fetch(`/api/funds/batch-valuation?codes=${codesParam}&t=${Date.now()}`);
            const response = await res.json();

            if (response.data) {
                const fetchTime = new Date();

                // Update Cache
                setValuationCache(prev => {
                    const newCache = new Map(prev);
                    response.data.forEach((val: any) => {
                        if (val && !val.error && val.fund_code) {
                            newCache.set(val.fund_code, { data: val, timestamp: fetchTime.getTime() });
                        }
                    });
                    return newCache;
                });

                // Update Watchlist State
                setWatchlist(prev => prev.map(item => {
                    const val = response.data.find((v: any) => v.fund_code === item.code);
                    if (val && !val.error) {
                        return {
                            ...item,
                            previous_growth: item.estimated_growth,
                            estimated_growth: val.estimated_growth,
                            name: (val.fund_name && !item.name) ? val.fund_name : item.name,
                            source: val.source
                        };
                    }
                    return item;
                }));

                // Update selected fund if it was part of the batch
                if (selectedFund && codesToFetch.includes(selectedFund)) {
                    const selectedVal = response.data.find((v: any) => v.fund_code === selectedFund);
                    if (selectedVal && !selectedVal.error) {
                        setValuation(selectedVal);
                        setLastUpdated(fetchTime);
                    }
                }
            }
        } catch (err) {
            console.error('Failed to refresh watchlist:', err);
        } finally {
            setTimeout(() => {
                setIsWatchlistRefreshing(false);
            }, 600);
        }
    };

    const handleDelete = async (e: React.MouseEvent, codeToDelete: string) => {
        e.stopPropagation();

        try {
            const res = await fetch(`/api/watchlist/${codeToDelete}`, {
                method: 'DELETE',
            });
            const data = await res.json();
            if (data.success) {
                setWatchlist(prev => prev.filter(item => item.code !== codeToDelete));
                if (selectedFund === codeToDelete) {
                    const remaining = watchlist.filter(i => i.code !== codeToDelete);
                    if (remaining.length > 0) setSelectedFund(remaining[0].code);
                    else setSelectedFund("");
                }
            }
        } catch (err) {
            console.error('Failed to delete from watchlist:', err);
        }
    };

    const handleManualRefresh = async () => {
        if (selectedFund && !refreshing) {
            setRefreshing(true);

            // Clear cache to force fresh fetch
            setValuationCache(prev => {
                const newCache = new Map(prev);
                newCache.delete(selectedFund);
                return newCache;
            });

            await fetchValuation(selectedFund);

            // Keep animation for at least 600ms for better UX
            setTimeout(() => {
                setRefreshing(false);
            }, 600);
        }
    };

    return (
        <div className="h-screen flex flex-col p-4 md:p-6 lg:p-8 font-sans bg-white text-slate-900 overflow-hidden">
            <header className="mb-8">
                <h1 className="text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-400 flex items-center gap-3">
                    <span>💎</span>
                    {t('title')}
                </h1>
                <p className="text-slate-500 font-mono text-xs mt-1 uppercase tracking-widest pl-12">
                    {t('subtitle')}
                </p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
                {/* Left: Watchlist */}
                <div className="lg:col-span-4 h-full min-h-0">
                    <Card
                        title={t('watchlist')}
                        className="h-full flex flex-col overflow-hidden"
                        contentClassName="flex-1 min-h-0 flex flex-col p-3"
                        action={
                            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                                <button
                                    onClick={handleWatchlistRefresh}
                                    className={`p-1 rounded-md transition-all ${isWatchlistRefreshing ? 'text-blue-600 bg-blue-50' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'}`}
                                    title={t('refreshWatchlist')}
                                    disabled={isWatchlistRefreshing}
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${isWatchlistRefreshing ? 'animate-spin' : ''}`} />
                                </button>
                                <div className="w-px h-3 bg-slate-200 mx-0.5"></div>
                                <button
                                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'none' : 'asc')}
                                    className={`p-1 rounded-md transition-all ${sortOrder === 'asc' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'}`}
                                    title="涨幅从低到高"
                                >
                                    <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => setSortOrder(sortOrder === 'desc' ? 'none' : 'desc')}
                                    className={`p-1 rounded-md transition-all ${sortOrder === 'desc' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'}`}
                                    title="涨幅从高到低"
                                >
                                    <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        }
                    >
                        <div className="flex flex-col h-full min-h-0">
                            <div className="mb-4 shrink-0 relative z-20">
                                <FundSearch
                                    onAddFund={async (code, name) => {
                                        if (!watchlist.some(i => i.code === code)) {
                                            try {
                                                const res = await fetch('/api/watchlist', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ code, name })
                                                });
                                                const data = await res.json();
                                                if (data.success) {
                                                    setWatchlist(prev => [...prev, { code, name }]);
                                                    setSelectedFund(code);
                                                }
                                            } catch (err) {
                                                console.error('Failed to add to watchlist:', err);
                                            }
                                        } else {
                                            setSelectedFund(code);
                                        }
                                    }}
                                    existingCodes={watchlist.map(w => w.code)}
                                    placeholder={t('addPlaceholder')}
                                />
                            </div>

                            <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-1 custom-scrollbar">
                                {watchlist
                                    .slice() // Create a copy to avoid mutating state
                                    .sort((a, b) => {
                                        if (sortOrder === 'none') return 0;

                                        // Funds without growth data go to the end
                                        if (a.estimated_growth === undefined && b.estimated_growth === undefined) return 0;
                                        if (a.estimated_growth === undefined) return 1;
                                        if (b.estimated_growth === undefined) return -1;

                                        return sortOrder === 'desc'
                                            ? b.estimated_growth - a.estimated_growth
                                            : a.estimated_growth - b.estimated_growth;
                                    })
                                    .map(item => (
                                        <div
                                            key={item.code}
                                            onClick={() => setSelectedFund(item.code)}
                                            className={`group flex items-center justify-between p-3 rounded-md transition-all cursor-pointer ${selectedFund === item.code
                                                ? 'bg-blue-50 border border-blue-200 text-blue-700'
                                                : 'bg-white border border-transparent hover:bg-slate-50 text-slate-900'
                                                }`}
                                        >
                                            <div className="flex flex-col overflow-hidden flex-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-bold text-sm truncate">{item.name || item.code}</span>
                                                    {item.estimated_growth !== undefined && (
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            <span className={`font-mono text-xs font-bold ${item.estimated_growth >= 0 ? 'text-rose-600' : 'text-emerald-600'
                                                                }`}>
                                                                {item.estimated_growth > 0 ? '+' : ''}{item.estimated_growth.toFixed(2)}%
                                                            </span>
                                                            {/* Trend Arrow */}
                                                            {item.previous_growth !== undefined && item.estimated_growth !== item.previous_growth && (
                                                                item.estimated_growth > item.previous_growth ? (
                                                                    <ArrowUp className="w-3 h-3 text-rose-600" />
                                                                ) : (
                                                                    <ArrowDown className="w-3 h-3 text-emerald-600" />
                                                                )
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <span className="font-mono text-[10px] opacity-60">{item.code}</span>
                                                    {item.source && (
                                                        <div className="flex gap-1" title={`Source: ${item.source}`}>
                                                            {item.source.includes('Calibration') && (
                                                                <Scale className="w-3 h-3 text-blue-500" />
                                                            )}
                                                            {item.source.includes('ETF') && (
                                                                <Anchor className="w-3 h-3 text-blue-500" />
                                                            )}
                                                            {(item.code === '002207' || item.code === '022365') && (
                                                                <AlertTriangle className="w-3 h-3 text-amber-500" />
                                                            )}
                                                            {!item.source.includes('Calibration') && !item.source.includes('ETF') && item.code !== '002207' && item.code !== '022365' && (
                                                                <Target className="w-3 h-3 text-emerald-500" />
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0 ml-2">
                                                {selectedFund === item.code && loading && <RefreshCw className="w-3 h-3 animate-spin" />}
                                                <button
                                                    onClick={(e) => handleDelete(e, item.code)}
                                                    className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-900 transition-colors"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}

                            </div>
                        </div>
                    </Card>
                </div>

                {/* Right: Details */}
                <div className="lg:col-span-8 h-full min-h-0">
                    {valuation ? (
                        <div className="flex flex-col gap-6 h-full">
                            {/* Main KPI Card */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Card className="md:col-span-2 relative overflow-hidden bg-white">
                                    <div className="flex flex-col h-full justify-between z-10 relative">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h2 className="text-sm font-mono text-slate-500 uppercase tracking-widest">{t('estimatedGrowth')}</h2>
                                                <div className="text-5xl font-black mt-2 tracking-tighter flex items-center gap-2">
                                                    <span className={valuation.estimated_growth >= 0 ? "text-rose-600" : "text-emerald-600"}>
                                                        {valuation.estimated_growth > 0 ? "+" : ""}{valuation.estimated_growth.toFixed(2)}%
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={handleManualRefresh}
                                                    disabled={loading || refreshing}
                                                    className="p-2 hover:bg-slate-100 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Refresh data"
                                                >
                                                    <RefreshCw className={`w-4 h-4 text-slate-400 transition-transform ${refreshing ? 'animate-spin' : ''}`} />
                                                </button>
                                                <Badge variant={valuation.estimated_growth >= 0 ? 'bearish' : 'bullish'}>
                                                    {t('live')}
                                                </Badge>
                                            </div>
                                        </div>
                                        <div className="mt-4 text-xs text-slate-500 font-mono">
                                            {t('basedOn', { count: valuation.components.length, weight: valuation.total_weight.toFixed(1) })}
                                            <br />
                                            {t('lastUpdated', { time: lastUpdated ? lastUpdated.toLocaleTimeString() : '' })}
                                            {/* Source & Calibration Note */}
                                            {valuation.source && (
                                                <div className="mt-1 opacity-70">
                                                    Source: {valuation.source}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    {/* Background Accents (Subtle) */}
                                    <div className={`absolute -right-10 -top-10 w-40 h-40 blur-3xl opacity-5 rounded-full ${valuation.estimated_growth >= 0 ? 'bg-rose-500' : 'bg-emerald-500'}`}></div>
                                </Card>

                                <Card>
                                    <h2 className="text-sm font-mono text-slate-500 uppercase tracking-widest mb-4">{t('topDrivers')}</h2>
                                    <div className="flex flex-col gap-2">
                                        {valuation.components
                                            .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
                                            .slice(0, 3)
                                            .map(comp => (
                                                <div key={comp.code} className="flex justify-between items-center text-xs border-b border-slate-100 pb-2 last:border-0 hover:bg-slate-50 p-1 rounded">
                                                    <div className="flex gap-2">
                                                        <span className="font-mono text-slate-500">{comp.code}</span>
                                                        <span className="text-slate-700 truncate max-w-[80px] font-medium">{comp.name}</span>
                                                    </div>
                                                    <span className={`font-mono font-bold ${comp.impact >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                        {comp.impact > 0 ? "+" : ""}{comp.impact.toFixed(3)}%
                                                    </span>
                                                </div>
                                            ))}
                                    </div>
                                </Card>
                            </div>

                            {/* Attribution Table */}
                            <Card
                                title={t('attribution')}
                                className="flex-1 min-h-0 flex flex-col overflow-hidden"
                                contentClassName="flex-1 min-h-0 flex flex-col p-0"
                            >
                                <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
                                    <table className="w-full text-left border-collapse text-sm">
                                        <thead className="sticky top-0 bg-white z-10">
                                            <tr className="border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-wider shadow-sm bg-slate-50/80 backdrop-blur">
                                                <th className="p-3">{t('tableStock')}</th>
                                                <th className="p-3 text-right">{t('tablePrice')}</th>
                                                <th className="p-3 text-right">{t('tableChange')}</th>
                                                <th className="p-3 text-right">{t('tableWeight')}</th>
                                                <th className="p-3 text-right">{t('tableImpact')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {valuation.components
                                                .slice() // Create a copy to avoid mutating
                                                .sort((a, b) => b.weight - a.weight) // Sort by weight descending
                                                .map(comp => (
                                                    <tr key={comp.code} className="group hover:bg-slate-50 transition-colors">
                                                        <td className="p-3">
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-slate-800">{comp.name}</span>
                                                                <span className="text-[10px] font-mono text-slate-500">{comp.code}</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-3 text-right font-mono text-slate-600">
                                                            {comp.price.toFixed(2)}
                                                        </td>
                                                        <td className={`p-3 text-right font-mono font-bold ${comp.change_pct >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                            {comp.change_pct > 0 ? "+" : ""}{comp.change_pct.toFixed(2)}%
                                                        </td>
                                                        <td className="p-3 text-right font-mono text-slate-500">
                                                            {comp.weight.toFixed(2)}%
                                                        </td>
                                                        <td className={`p-3 text-right font-mono font-bold ${comp.impact >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                            {comp.impact > 0 ? "+" : ""}{comp.impact.toFixed(3)}%
                                                        </td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        </div>
                    ) : (
                        <div className="h-64 flex items-center justify-center text-slate-500">
                            {loading ? t('loading') : t('selectFund')}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
