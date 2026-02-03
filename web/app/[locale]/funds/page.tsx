'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Search, RefreshCw, ArrowUp, ArrowDown, PieChart, X } from 'lucide-react';
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
}

interface WatchlistItem {
    code: string;
    name: string;
    estimated_growth?: number; // For sorting by daily performance
    previous_growth?: number; // For trend arrows (↑↓)
}

export default function FundDashboard({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = React.use(params);
    const t = useTranslations('Funds');

    // Load from localStorage with fallback defaults
    const getInitialWatchlist = (): WatchlistItem[] => {
        if (typeof window === 'undefined') return [
            { code: '022365', name: '永赢科技智选混合C' },
            { code: '020840', name: '南方中证半导体C' }
        ];
        try {
            const stored = localStorage.getItem('fund_watchlist');
            if (stored) {
                const parsed = JSON.parse(stored);
                return parsed.length > 0 ? parsed : [
                    { code: '022365', name: '永赢科技智选混合C' },
                    { code: '020840', name: '南方中证半导体C' }
                ];
            }
        } catch (e) {
            console.error('Failed to load watchlist from localStorage:', e);
        }
        return [
            { code: '022365', name: '永赢科技智选混合C' },
            { code: '020840', name: '南方中证半导体C' }
        ];
    };

    const getInitialSelectedFund = (): string => {
        if (typeof window === 'undefined') return '022365';
        try {
            const stored = localStorage.getItem('fund_selected');
            if (stored) return stored;
        } catch (e) {
            console.error('Failed to load selected fund from localStorage:', e);
        }
        return '022365';
    };

    const [watchlist, setWatchlist] = useState<WatchlistItem[]>(getInitialWatchlist);
    const [selectedFund, setSelectedFund] = useState<string>(getInitialSelectedFund);
    const [valuation, setValuation] = useState<FundValuation | null>(null);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false); // For refresh button animation
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    // Client-side cache for fund valuations (3 minutes TTL)
    const [valuationCache, setValuationCache] = useState<Map<string, { data: FundValuation, timestamp: number }>>(new Map());
    const CACHE_TTL = 3 * 60 * 1000; // 3 minutes in milliseconds

    const fetchValuation = async (code: string) => {
        // Check cache first
        const cached = valuationCache.get(code);
        const now = Date.now();

        if (cached && (now - cached.timestamp) < CACHE_TTL) {
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
                        estimated_growth: data.estimated_growth // Update with new value
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

    // Preload all watchlist funds' data on mount for sorting
    useEffect(() => {
        const preloadWatchlist = async () => {
            for (const item of watchlist) {
                // Only fetch if not in cache
                const cached = valuationCache.get(item.code);
                const now = Date.now();
                if (!cached || (now - cached.timestamp) >= CACHE_TTL) {
                    // Fetch in background without blocking UI
                    fetchValuation(item.code).catch(err => {
                        console.error(`Failed to preload ${item.code}:`, err);
                    });
                    // Small delay to avoid overwhelming the server
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
        };

        // Delay preload slightly to prioritize selected fund
        const timer = setTimeout(preloadWatchlist, 1000);
        return () => clearTimeout(timer);
    }, []); // Only run on mount

    // Persist watchlist to localStorage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem('fund_watchlist', JSON.stringify(watchlist));
            } catch (e) {
                console.error('Failed to save watchlist to localStorage:', e);
            }
        }
    }, [watchlist]);

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
    useEffect(() => {
        const interval = setInterval(() => {
            if (selectedFund) {
                // Clear cache entry to force fresh fetch
                setValuationCache(prev => {
                    const newCache = new Map(prev);
                    newCache.delete(selectedFund);
                    return newCache;
                });
                fetchValuation(selectedFund);
            }
        }, CACHE_TTL);
        return () => clearInterval(interval);
    }, [selectedFund]);

    const handleDelete = (e: React.MouseEvent, codeToDelete: string) => {
        e.stopPropagation();
        setWatchlist(prev => prev.filter(item => item.code !== codeToDelete));
        if (selectedFund === codeToDelete) {
            // If deleting active, switch to first available or empty
            const remaining = watchlist.filter(i => i.code !== codeToDelete);
            if (remaining.length > 0) setSelectedFund(remaining[0].code);
            else setSelectedFund("");
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
        <div className="min-h-screen p-4 md:p-6 lg:p-8 font-sans bg-[#020617] text-slate-100">
            <header className="mb-8">
                <h1 className="text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 flex items-center gap-3">
                    <span>🔮</span>
                    {t('title')}
                </h1>
                <p className="text-slate-500 font-mono text-xs mt-1 uppercase tracking-widest pl-12">
                    {t('subtitle')}
                </p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: Watchlist */}
                <div className="lg:col-span-3">
                    <Card title={t('watchlist')} className="overflow-visible">
                        <div className="flex flex-col gap-2">
                            {watchlist
                                .slice() // Create a copy to avoid mutating state
                                .sort((a, b) => {
                                    // Sort by estimated_growth (descending)
                                    // Funds without growth data go to the end
                                    if (a.estimated_growth === undefined && b.estimated_growth === undefined) return 0;
                                    if (a.estimated_growth === undefined) return 1;
                                    if (b.estimated_growth === undefined) return -1;
                                    return b.estimated_growth - a.estimated_growth;
                                })
                                .map(item => (
                                    <div
                                        key={item.code}
                                        onClick={() => setSelectedFund(item.code)}
                                        className={`group flex items-center justify-between p-3 rounded-md transition-all cursor-pointer ${selectedFund === item.code
                                            ? 'bg-purple-500/20 border border-purple-500/50 text-purple-200'
                                            : 'bg-slate-900/50 border border-slate-800 hover:bg-slate-800 text-slate-400'
                                            }`}
                                    >
                                        <div className="flex flex-col overflow-hidden flex-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-bold text-sm truncate">{item.name || item.code}</span>
                                                {item.estimated_growth !== undefined && (
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <span className={`font-mono text-xs font-bold ${item.estimated_growth >= 0 ? 'text-rose-400' : 'text-emerald-400'
                                                            }`}>
                                                            {item.estimated_growth > 0 ? '+' : ''}{item.estimated_growth.toFixed(2)}%
                                                        </span>
                                                        {/* Trend Arrow */}
                                                        {item.previous_growth !== undefined && item.estimated_growth !== item.previous_growth && (
                                                            item.estimated_growth > item.previous_growth ? (
                                                                <ArrowUp className="w-3 h-3 text-rose-400" />
                                                            ) : (
                                                                <ArrowDown className="w-3 h-3 text-emerald-400" />
                                                            )
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <span className="font-mono text-[10px] opacity-60">{item.code}</span>
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0 ml-2">
                                            {selectedFund === item.code && loading && <RefreshCw className="w-3 h-3 animate-spin" />}
                                            <button
                                                onClick={(e) => handleDelete(e, item.code)}
                                                className="p-1 hover:bg-white/10 rounded-full text-slate-500 hover:text-rose-400 transition-colors"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                ))}


                            <div className="mt-2">
                                <FundSearch
                                    onAddFund={(code, name) => {
                                        if (!watchlist.some(i => i.code === code)) {
                                            setWatchlist([...watchlist, { code, name }]);
                                            setSelectedFund(code);
                                        }
                                    }}
                                    existingCodes={watchlist.map(w => w.code)}
                                    placeholder={t('addPlaceholder')}
                                />
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Right: Details */}
                <div className="lg:col-span-9">
                    {valuation ? (
                        <div className="flex flex-col gap-6">
                            {/* Main KPI Card */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Card className="md:col-span-2 relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-900/50">
                                    <div className="flex flex-col h-full justify-between z-10 relative">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h2 className="text-sm font-mono text-slate-400 uppercase tracking-widest">{t('estimatedGrowth')}</h2>
                                                <div className="text-5xl font-black mt-2 tracking-tighter flex items-center gap-2">
                                                    <span className={valuation.estimated_growth >= 0 ? "text-rose-400" : "text-emerald-400"}>
                                                        {valuation.estimated_growth > 0 ? "+" : ""}{valuation.estimated_growth.toFixed(2)}%
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={handleManualRefresh}
                                                    disabled={loading || refreshing}
                                                    className="p-2 hover:bg-white/10 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                                        </div>
                                    </div>
                                    {/* Background Accents */}
                                    <div className={`absolute -right-10 -top-10 w-40 h-40 blur-3xl opacity-10 rounded-full ${valuation.estimated_growth >= 0 ? 'bg-rose-500' : 'bg-emerald-500'}`}></div>
                                </Card>

                                <Card>
                                    <h2 className="text-sm font-mono text-slate-400 uppercase tracking-widest mb-4">{t('topDrivers')}</h2>
                                    <div className="flex flex-col gap-2">
                                        {valuation.components
                                            .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
                                            .slice(0, 3)
                                            .map(comp => (
                                                <div key={comp.code} className="flex justify-between items-center text-xs border-b border-slate-800/50 pb-2 last:border-0 hover:bg-white/5 p-1 rounded">
                                                    <div className="flex gap-2">
                                                        <span className="font-mono text-slate-500">{comp.code}</span>
                                                        <span className="text-slate-300 truncate max-w-[80px]">{comp.name}</span>
                                                    </div>
                                                    <span className={`font-mono font-bold ${comp.impact >= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                        {comp.impact > 0 ? "+" : ""}{comp.impact.toFixed(3)}%
                                                    </span>
                                                </div>
                                            ))}
                                    </div>
                                </Card>
                            </div>

                            {/* Attribution Table */}
                            <Card title={t('attribution')}>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-800 text-slate-500 text-[10px] uppercase tracking-wider">
                                                <th className="p-3">{t('tableStock')}</th>
                                                <th className="p-3 text-right">{t('tablePrice')}</th>
                                                <th className="p-3 text-right">{t('tableChange')}</th>
                                                <th className="p-3 text-right">{t('tableWeight')}</th>
                                                <th className="p-3 text-right">{t('tableImpact')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/50">
                                            {valuation.components
                                                .slice() // Create a copy to avoid mutating
                                                .sort((a, b) => b.weight - a.weight) // Sort by weight descending
                                                .map(comp => (
                                                    <tr key={comp.code} className="group hover:bg-slate-800/30 transition-colors">
                                                        <td className="p-3">
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-slate-200">{comp.name}</span>
                                                                <span className="text-[10px] font-mono text-slate-500">{comp.code}</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-3 text-right font-mono text-slate-400">
                                                            {comp.price.toFixed(2)}
                                                        </td>
                                                        <td className={`p-3 text-right font-mono font-bold ${comp.change_pct >= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                            {comp.change_pct > 0 ? "+" : ""}{comp.change_pct.toFixed(2)}%
                                                        </td>
                                                        <td className="p-3 text-right font-mono text-slate-500">
                                                            {comp.weight.toFixed(2)}%
                                                        </td>
                                                        <td className={`p-3 text-right font-mono font-bold ${comp.impact >= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
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
