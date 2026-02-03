'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, X, TrendingUp, Clock, Plus } from 'lucide-react';

interface FundSearchResult {
    code: string;
    name: string;
    type?: string;
    company?: string;
}

interface FundSearchProps {
    onAddFund: (code: string, name: string) => void;
    existingCodes: string[];
    placeholder?: string;
}

export default function FundSearch({ onAddFund, existingCodes, placeholder = '搜索基金代码或名称...' }: FundSearchProps) {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [searchResults, setSearchResults] = useState<FundSearchResult[]>([]);
    const [popularFunds, setPopularFunds] = useState<FundSearchResult[]>([]);
    const [searchHistory, setSearchHistory] = useState<string[]>([]);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [isLoading, setIsLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Load search history from localStorage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            try {
                const history = localStorage.getItem('fund_search_history');
                if (history) {
                    setSearchHistory(JSON.parse(history));
                }
            } catch (e) {
                console.error('Failed to load search history:', e);
            }
        }
    }, []);

    // Load popular funds on mount
    useEffect(() => {
        const loadPopularFunds = async () => {
            try {
                // Search for some popular fund codes to get initial data
                const response = await fetch('/api/funds/search?q=混合&limit=10');
                const data = await response.json();
                if (data.results) {
                    setPopularFunds(data.results.filter((f: FundSearchResult) => !existingCodes.includes(f.code)));
                }
            } catch (e) {
                console.error('Failed to load popular funds:', e);
            }
        };
        loadPopularFunds();
    }, [existingCodes]);

    // Save search history to localStorage
    const saveToHistory = (code: string) => {
        const newHistory = [code, ...searchHistory.filter(c => c !== code)].slice(0, 5);
        setSearchHistory(newHistory);
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem('fund_search_history', JSON.stringify(newHistory));
            } catch (e) {
                console.error('Failed to save search history:', e);
            }
        }
    };

    // Search logic with debouncing and request cancellation
    useEffect(() => {
        // Clear previous timeout
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        // Create AbortController for the effect
        const controller = new AbortController();

        if (query.trim()) {
            // Set timeout for debounce
            searchTimeoutRef.current = setTimeout(async () => {
                setIsLoading(true); // Start loading only after debounce

                try {
                    const response = await fetch(
                        `/api/funds/search?q=${encodeURIComponent(query)}&limit=20`,
                        { signal: controller.signal }
                    );
                    const data = await response.json();
                    if (!controller.signal.aborted && data.results) {
                        const filtered = data.results.filter((f: FundSearchResult) => !existingCodes.includes(f.code));
                        setSearchResults(filtered);
                    }
                } catch (e: any) {
                    if (e.name !== 'AbortError') {
                        console.error('Search failed:', e);
                        setSearchResults([]);
                    }
                } finally {
                    if (!controller.signal.aborted) {
                        setIsLoading(false);
                    }
                }
            }, 500); // Increased to 500ms for better experience
        } else {
            setSearchResults([]);
            setIsLoading(false);
        }

        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
            controller.abort(); // Cancel any pending request on cleanup
        };
    }, [query, existingCodes]);

    // Click outside to close
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (fund: FundSearchResult) => {
        onAddFund(fund.code, fund.name);
        saveToHistory(fund.code);
        setQuery('');
        setIsOpen(false);
        setActiveIndex(-1);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) {
            if (e.key === 'Enter' || e.key === 'ArrowDown') {
                setIsOpen(true);
            }
            return;
        }

        const items = query ? searchResults : getRecommendations();

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setActiveIndex(prev => (prev < items.length - 1 ? prev + 1 : prev));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setActiveIndex(prev => (prev > 0 ? prev - 1 : -1));
                break;
            case 'Enter':
                e.preventDefault();
                if (isLoading) {
                    // Do nothing while loading to prevent accidental adds
                    return;
                }

                if (activeIndex >= 0 && items[activeIndex]) {
                    // Select active item
                    handleSelect(items[activeIndex]);
                } else if (items.length > 0) {
                    // Auto-select first item if valid results exist
                    handleSelect(items[0]);
                } else if (query.trim()) {
                    // Only direct add if no results and not loading
                    onAddFund(query.trim(), '');
                    saveToHistory(query.trim());
                    setQuery('');
                    setIsOpen(false);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                setActiveIndex(-1);
                break;
        }
    };

    const getRecommendations = (): FundSearchResult[] => {
        // If no popular funds loaded yet, return empty
        if (popularFunds.length === 0) {
            return [];
        }

        // 优先显示搜索历史对应的基金
        const historyFunds = searchHistory
            .map(code => popularFunds.find((f: FundSearchResult) => f.code === code))
            .filter((f): f is FundSearchResult => f !== undefined)
            .filter((f: FundSearchResult) => !existingCodes.includes(f.code));

        // 然后显示热门基金
        const remainingPopular = popularFunds
            .filter((f: FundSearchResult) => !existingCodes.includes(f.code))
            .filter((f: FundSearchResult) => !historyFunds.some(hf => hf.code === f.code))
            .slice(0, 5 - historyFunds.length);

        return [...historyFunds, ...remainingPopular];
    };

    const displayItems = query ? searchResults : getRecommendations();

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Search Input */}
            <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className="w-full bg-slate-950 border border-slate-800 rounded-md py-2 pl-9 pr-8 text-sm focus:border-purple-500 outline-none transition-colors"
                />
                {query && (
                    <button
                        onClick={() => {
                            setQuery('');
                            inputRef.current?.focus();
                        }}
                        className="absolute right-2 top-2.5 text-slate-500 hover:text-slate-300"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute z-50 w-full mt-2 bg-slate-900 border border-slate-800 rounded-md shadow-2xl max-h-80 overflow-y-auto">
                    {/* Loading State */}
                    {isLoading && query && (
                        <div className="p-4 text-center">
                            <div className="animate-spin w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                            <p className="text-sm text-slate-500">搜索中...</p>
                        </div>
                    )}

                    {/* Results */}
                    {!isLoading && displayItems.length > 0 && (
                        <>
                            {/* Header */}
                            <div className="px-3 py-2 border-b border-slate-800">
                                <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wider">
                                    {query ? (
                                        <>
                                            <Search className="w-3 h-3" />
                                            <span>搜索结果 ({searchResults.length})</span>
                                        </>
                                    ) : (
                                        <>
                                            {searchHistory.length > 0 ? (
                                                <>
                                                    <Clock className="w-3 h-3" />
                                                    <span>最近搜索</span>
                                                </>
                                            ) : (
                                                <>
                                                    <TrendingUp className="w-3 h-3" />
                                                    <span>热门基金</span>
                                                </>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Results List */}
                            <div className="py-1">
                                {displayItems.map((fund, index) => {
                                    const isActive = index === activeIndex;
                                    const isHistory = !query && searchHistory.includes(fund.code);

                                    return (
                                        <button
                                            key={fund.code}
                                            onClick={() => handleSelect(fund)}
                                            onMouseEnter={() => setActiveIndex(index)}
                                            className={`w-full px-3 py-2 text-left transition-colors ${isActive
                                                ? 'bg-purple-500/20 border-l-2 border-purple-500'
                                                : 'hover:bg-slate-800/50 border-l-2 border-transparent'
                                                }`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-sm text-slate-200 truncate">
                                                            {fund.name}
                                                        </span>
                                                        {isHistory && (
                                                            <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="font-mono text-xs text-slate-500">
                                                            {fund.code}
                                                        </span>
                                                        {fund.type && (
                                                            <>
                                                                <span className="text-slate-700">•</span>
                                                                <span className="text-xs text-slate-600">
                                                                    {fund.type}
                                                                </span>
                                                            </>
                                                        )}
                                                        {fund.company && (
                                                            <>
                                                                <span className="text-slate-700">•</span>
                                                                <span className="text-xs text-slate-600 truncate">
                                                                    {fund.company}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                <Plus className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Footer Hint */}
                            <div className="px-3 py-2 border-t border-slate-800 bg-slate-950">
                                <p className="text-xs text-slate-600">
                                    <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-[10px]">↑</kbd>
                                    <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-[10px] ml-1">↓</kbd>
                                    {' '}导航 {' '}
                                    <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-[10px]">Enter</kbd>
                                    {' '}选择 {' '}
                                    <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-[10px]">Esc</kbd>
                                    {' '}关闭
                                </p>
                            </div>
                        </>
                    )}

                    {/* No Results */}
                    {!isLoading && query && searchResults.length === 0 && (
                        <div className="p-4 text-center">
                            <p className="text-sm text-slate-500 mb-2">未找到匹配的基金</p>
                            <button
                                onClick={() => {
                                    onAddFund(query.trim(), '');
                                    saveToHistory(query.trim());
                                    setQuery('');
                                    setIsOpen(false);
                                }}
                                className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                            >
                                直接添加代码 "{query}"
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
