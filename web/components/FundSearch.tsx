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
    const [searchHistory, setSearchHistory] = useState<FundSearchResult[]>([]); // Store objects: {code, name, ...}
    const [activeIndex, setActiveIndex] = useState(-1);
    const [isLoading, setIsLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Load search history from localStorage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            try {
                // Try to load new format first
                const historyV2 = localStorage.getItem('fund_search_history_v2');
                if (historyV2) {
                    setSearchHistory(JSON.parse(historyV2));
                } else {
                    // Fallback to legacy format (array of strings)
                    const history = localStorage.getItem('fund_search_history');
                    if (history) {
                        const legacy = JSON.parse(history);
                        // Convert to object format
                        setSearchHistory(legacy.map((code: string) => ({ code, name: '最近搜索' })));
                    }
                }
            } catch (e) {
                console.error('Failed to load search history:', e);
            }
        }
    }, []);

    // Save search history to localStorage
    const saveToHistory = (fund: { code: string, name: string }) => {
        // Remove existing if any
        const filtered = searchHistory.filter(item => item.code !== fund.code);
        // Add to front
        const newHistory = [{
            code: fund.code,
            name: fund.name || '未命名基金'
        }, ...filtered].slice(0, 5);

        setSearchHistory(newHistory);
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem('fund_search_history_v2', JSON.stringify(newHistory));
            } catch (e) {
                console.error('Failed to save search history:', e);
            }
        }
    };

    // Search logic with debouncing and request cancellation
    // Search function definition
    const performSearch = async (searchTerm: string) => {
        if (!searchTerm.trim()) {
            setSearchResults([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch(
                `/api/funds/search?q=${encodeURIComponent(searchTerm)}&limit=20`
            );
            const data = await response.json();
            if (data.results) {
                setSearchResults(data.results);
            }
        } catch (e) {
            console.error('Search failed:', e);
            setSearchResults([]);
        } finally {
            setIsLoading(false);
        }
    };

    // Manual debounce for input change
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setQuery(val);

        // Clear existing timeout
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        if (val.trim()) {
            // Set new timeout
            searchTimeoutRef.current = setTimeout(() => {
                performSearch(val);
            }, 800);
        } else {
            setSearchResults([]);
            setIsLoading(false);
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
        };
    }, []);

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
        // Save full object to history
        saveToHistory({ code: fund.code, name: fund.name });
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
                    saveToHistory({ code: query.trim(), name: '自定义添加' });
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

    // Removed popularFunds state

    const getRecommendations = (): FundSearchResult[] => {
        if (searchHistory.length === 0) {
            return [];
        }

        // Filter out already added funds from history
        return searchHistory.filter(f => !existingCodes.includes(f.code));
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
                    onChange={handleInputChange}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className="w-full bg-white border border-slate-200 rounded-md py-2 pl-9 pr-8 text-sm focus:border-blue-600 outline-none transition-colors text-slate-900 placeholder-slate-400"
                />
                {query && (
                    <button
                        onClick={() => {
                            setQuery('');
                            inputRef.current?.focus();
                        }}
                        className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-md shadow-2xl max-h-80 overflow-y-auto">
                    {/* Loading State */}
                    {isLoading && query && (
                        <div className="p-4 text-center">
                            <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2"></div>
                            <p className="text-sm text-slate-500">搜索中...</p>
                        </div>
                    )}

                    {/* Results */}
                    {!isLoading && displayItems.length > 0 && (
                        <>
                            {/* Header */}
                            <div className="px-3 py-2 border-b border-slate-100">
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
                                    const isHistory = !query && searchHistory.some(h => h.code === fund.code);
                                    const isAdded = existingCodes.includes(fund.code);

                                    return (
                                        <button
                                            key={fund.code}
                                            onClick={() => !isAdded && handleSelect(fund)}
                                            onMouseEnter={() => setActiveIndex(index)}
                                            disabled={isAdded}
                                            className={`w-full px-3 py-2 text-left transition-colors ${isActive
                                                ? 'bg-blue-50 border-l-2 border-blue-600'
                                                : 'hover:bg-slate-50 border-l-2 border-transparent'
                                                } ${isAdded ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-sm text-slate-800 truncate">
                                                            {fund.name}
                                                        </span>
                                                        {isHistory && (
                                                            <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                                                        )}
                                                        {isAdded && (
                                                            <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded-full font-mono border border-slate-200">
                                                                已添加
                                                            </span>
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
                                                {!isAdded && (
                                                    <Plus className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Footer Hint */}
                            <div className="px-3 py-2 border-t border-slate-100 bg-slate-50">
                                <p className="text-xs text-slate-500">
                                    <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] text-slate-400">↑</kbd>
                                    <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] ml-1 text-slate-400">↓</kbd>
                                    {' '}导航 {' '}
                                    <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] text-slate-400">Enter</kbd>
                                    {' '}选择 {' '}
                                    <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] text-slate-400">Esc</kbd>
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
                                    saveToHistory({ code: query.trim(), name: '自定义添加' });
                                    setQuery('');
                                    setIsOpen(false);
                                }}
                                className="text-xs text-blue-600 hover:text-blue-700 transition-colors"
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
