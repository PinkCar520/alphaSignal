'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Search, RefreshCw, ArrowUp, ArrowDown, PieChart } from 'lucide-react';

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
    estimated_growth: number;
    total_weight: number;
    components: ComponentStock[];
    timestamp: string;
}

export default function FundDashboard({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = React.use(params);
    const [watchlist, setWatchlist] = useState<string[]>(['022365', '020840']);
    const [selectedFund, setSelectedFund] = useState<string>('022365');
    const [valuation, setValuation] = useState<FundValuation | null>(null);
    const [loading, setLoading] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const fetchValuation = async (code: string) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/funds/${code}/valuation`);
            const data = await res.json();
            if (data.error) {
                console.error(data.error);
                return;
            }
            setValuation(data);
            setLastUpdated(new Date());
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

    // Auto refresh every 60s
    useEffect(() => {
        const interval = setInterval(() => {
            if (selectedFund) fetchValuation(selectedFund);
        }, 60000);
        return () => clearInterval(interval);
    }, [selectedFund]);

    return (
        <div className="min-h-screen p-4 md:p-6 lg:p-8 font-sans bg-[#020617] text-slate-100">
            <header className="mb-8">
                <h1 className="text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 flex items-center gap-3">
                    <span>🔮</span>
                    AlphaFunds Valuation
                </h1>
                <p className="text-slate-500 font-mono text-xs mt-1 uppercase tracking-widest pl-12">
                    Real-time NAV Estimation Engine
                </p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: Watchlist */}
                <div className="lg:col-span-3">
                    <Card title="Watchlist">
                        <div className="flex flex-col gap-2">
                            {watchlist.map(code => (
                                <button
                                    key={code}
                                    onClick={() => setSelectedFund(code)}
                                    className={`flex items-center justify-between p-3 rounded-md transition-all ${selectedFund === code
                                            ? 'bg-purple-500/20 border border-purple-500/50 text-purple-200'
                                            : 'bg-slate-900/50 border border-slate-800 hover:bg-slate-800 text-slate-400'
                                        }`}
                                >
                                    <span className="font-mono font-bold">{code}</span>
                                    {selectedFund === code && loading && <RefreshCw className="w-3 h-3 animate-spin" />}
                                </button>
                            ))}

                            <div className="relative mt-2">
                                <input
                                    type="text"
                                    placeholder="Add Fund Code..."
                                    className="w-full bg-slate-950 border border-slate-800 rounded-md py-2 pl-3 pr-8 text-sm focus:border-purple-500 outline-none"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            const val = e.currentTarget.value;
                                            if (val && !watchlist.includes(val)) {
                                                setWatchlist([...watchlist, val]);
                                                setSelectedFund(val);
                                                e.currentTarget.value = '';
                                            }
                                        }
                                    }}
                                />
                                <Search className="absolute right-2 top-2.5 w-4 h-4 text-slate-600" />
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
                                                <h2 className="text-sm font-mono text-slate-400 uppercase tracking-widest">Estimated Growth</h2>
                                                <div className="text-5xl font-black mt-2 tracking-tighter flex items-center gap-2">
                                                    <span className={valuation.estimated_growth >= 0 ? "text-emerald-400" : "text-rose-400"}>
                                                        {valuation.estimated_growth > 0 ? "+" : ""}{valuation.estimated_growth.toFixed(2)}%
                                                    </span>
                                                </div>
                                            </div>
                                            <Badge variant={valuation.estimated_growth >= 0 ? 'bullish' : 'bearish'}>
                                                LIVE
                                            </Badge>
                                        </div>
                                        <div className="mt-4 text-xs text-slate-500 font-mono">
                                            Based on {valuation.components.length} holdings ({valuation.total_weight.toFixed(1)}% weight)
                                            <br />
                                            Last Updated: {lastUpdated?.toLocaleTimeString()}
                                        </div>
                                    </div>
                                    {/* Background Accents */}
                                    <div className={`absolute -right-10 -top-10 w-40 h-40 blur-3xl opacity-10 rounded-full ${valuation.estimated_growth >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                                </Card>

                                <Card>
                                    <h2 className="text-sm font-mono text-slate-400 uppercase tracking-widest mb-4">Top Drivers</h2>
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
                                                    <span className={`font-mono font-bold ${comp.impact >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                        {comp.impact > 0 ? "+" : ""}{comp.impact.toFixed(3)}%
                                                    </span>
                                                </div>
                                            ))}
                                    </div>
                                </Card>
                            </div>

                            {/* Attribution Table */}
                            <Card title="Holdings Attribution">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-800 text-slate-500 text-[10px] uppercase tracking-wider">
                                                <th className="p-3">Stock</th>
                                                <th className="p-3 text-right">Price</th>
                                                <th className="p-3 text-right">Change</th>
                                                <th className="p-3 text-right">Weight</th>
                                                <th className="p-3 text-right">Impact</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/50">
                                            {valuation.components.map(comp => (
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
                                                    <td className={`p-3 text-right font-mono font-bold ${comp.change_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                        {comp.change_pct > 0 ? "+" : ""}{comp.change_pct.toFixed(2)}%
                                                    </td>
                                                    <td className="p-3 text-right font-mono text-slate-500">
                                                        {comp.weight.toFixed(2)}%
                                                    </td>
                                                    <td className={`p-3 text-right font-mono font-bold ${comp.impact >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
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
                            {loading ? "Calculating..." : "Select a fund to calculate valuation"}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
