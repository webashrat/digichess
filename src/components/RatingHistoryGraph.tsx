import { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../api/client';
import { fetchAccounts } from '../api/users';
import { AccountListItem } from '../api/types';

interface RatingHistoryGraphProps {
  username: string;
  mode: 'bullet' | 'blitz' | 'rapid' | 'classical';
  onClose: () => void;
}

interface RatingPoint {
  date: string;
  rating: number;
  gameId: number;
  isMax?: boolean;
  maxRating?: number;
  compareRating?: number; // Rating for comparison user
  compareIsMax?: boolean; // Max point for comparison user
}

export default function RatingHistoryGraph({ username, mode, onClose }: RatingHistoryGraphProps) {
  const [data, setData] = useState<RatingPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [compareUsername, setCompareUsername] = useState<string>('');
  const [compareData, setCompareData] = useState<RatingPoint[]>([]);
  const [compareLoading, setCompareLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<AccountListItem[]>([]);
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [userSearchLoading, setUserSearchLoading] = useState(false);

  useEffect(() => {
    console.log('[RatingHistoryGraph] Component mounted/updated:', { username, mode });
    loadRatingHistory();
  }, [username, mode, startDate, endDate]);

  useEffect(() => {
    if (compareUsername) {
      loadCompareRatingHistory();
    } else {
      setCompareData([]);
    }
  }, [compareUsername, mode, startDate, endDate]);

  // Search users for comparison
  useEffect(() => {
    if (userSearch.trim().length >= 2 && !compareUsername) {
      setUserSearchLoading(true);
      const timeoutId = setTimeout(() => {
        console.log('[RatingHistoryGraph] Searching users:', userSearch.trim());
        fetchAccounts({ search: userSearch.trim(), page_size: 20 })
          .then((res) => {
            console.log('[RatingHistoryGraph] Search results:', res);
            const filtered = (res.results || []).filter(u => 
              u.username && 
              u.username.toLowerCase().includes(userSearch.toLowerCase()) && 
              u.username !== username
            );
            console.log('[RatingHistoryGraph] Filtered results:', filtered);
            setUserSearchResults(filtered);
            setUserSearchLoading(false);
          })
          .catch((err) => {
            console.error('[RatingHistoryGraph] User search error:', err);
            setUserSearchResults([]);
            setUserSearchLoading(false);
          });
      }, 300);
      return () => {
        clearTimeout(timeoutId);
        setUserSearchLoading(false);
      };
    } else {
      setUserSearchResults([]);
      setUserSearchLoading(false);
    }
  }, [userSearch, username, compareUsername]);

  const loadRatingHistory = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Fetch rating history from the new API endpoint
      const params: any = { mode };
      
      if (startDate && startDate.trim()) {
        params.start = startDate;
      }
      if (endDate && endDate.trim()) {
        params.end = endDate;
      }

      const apiUrl = `/api/public/accounts/${username}/rating-history/`;
      const fullUrl = `${api.defaults.baseURL || 'http://localhost:8000'}${apiUrl}`;
      console.log('[RatingHistoryGraph] Fetching rating history with params:', params);
      console.log('[RatingHistoryGraph] API URL:', apiUrl);
      console.log('[RatingHistoryGraph] Base URL:', api.defaults.baseURL);
      console.log('[RatingHistoryGraph] Full URL:', fullUrl);
      console.log('[RatingHistoryGraph] Params:', params);
      
      // Make the request and log the full request details
      const response = await api.get(apiUrl, { 
        params,
        validateStatus: (status) => {
          console.log('[RatingHistoryGraph] Response status:', status);
          return status < 500; // Don't throw for 4xx errors, we'll handle them
        }
      });
      
      console.log('[RatingHistoryGraph] Response received:', response);
      
      if (response.status === 404) {
        throw new Error(`Endpoint not found: ${fullUrl}. Please ensure the server has been restarted.`);
      }
      console.log('[RatingHistoryGraph] Full API response:', response);
      console.log('[RatingHistoryGraph] Response status:', response.status);
      console.log('[RatingHistoryGraph] Response data:', response.data);
      
      const data = response.data;
      console.log('[RatingHistoryGraph] Rating history data:', data);
      
      if (!data) {
        throw new Error('No data received from API');
      }
      
      const history = data?.history || [];
      const currentRating = data?.current_rating || 800;
      
      console.log('[RatingHistoryGraph] History entries:', history.length);
      console.log('[RatingHistoryGraph] Current rating:', currentRating);
      
      // Convert to chart format
      // Sort by date to ensure chronological order
      const sortedHistory = [...history].sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      
      // Store both formatted and original dates
      const ratingHistoryWithDates = sortedHistory.map((entry: any) => ({
        formattedDate: new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        originalDate: entry.date, // Keep original ISO date for comparison
        rating: entry.rating,
        gameId: 0
      }));
      
      // If no history, at least show current rating
      let finalRatingHistory = ratingHistoryWithDates;
      if (finalRatingHistory.length === 0) {
        const today = new Date();
        finalRatingHistory = [{
          formattedDate: today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          originalDate: today.toISOString().split('T')[0],
          rating: currentRating,
          gameId: 0
        }];
      }
      
      // Find max rating for highlighting
      const maxRating = finalRatingHistory.length > 0 
        ? Math.max(...finalRatingHistory.map(p => p.rating))
        : currentRating;
      
      // Find the newest point with max rating (if multiple points have same max)
      // Sort by original date descending to get newest first
      const maxRatingPoints = finalRatingHistory
        .filter(p => p.rating === maxRating)
        .sort((a, b) => new Date(b.originalDate).getTime() - new Date(a.originalDate).getTime());
      const newestMaxPoint = maxRatingPoints.length > 0 ? maxRatingPoints[0] : null;
      
      // Add max rating indicator to data - only mark the newest max point
      const dataWithMax = finalRatingHistory.map((point) => ({
        date: point.formattedDate,
        rating: point.rating,
        gameId: point.gameId,
        isMax: newestMaxPoint && point.originalDate === newestMaxPoint.originalDate && point.rating === maxRating,
        maxRating: maxRating
      }));
      
      console.log('[RatingHistoryGraph] Processed rating history:', dataWithMax);
      console.log('[RatingHistoryGraph] Max rating:', maxRating);
      console.log('[RatingHistoryGraph] Newest max point:', newestMaxPoint);
      
      setData(dataWithMax);
    } catch (err: any) {
      console.error('[RatingHistoryGraph] Error:', err);
      console.error('[RatingHistoryGraph] Error type:', typeof err);
      console.error('[RatingHistoryGraph] Error message:', err?.message);
      console.error('[RatingHistoryGraph] Error response:', err?.response);
      console.error('[RatingHistoryGraph] Error response data:', err?.response?.data);
      
      // Extract error message safely
      let errorMsg = 'Failed to load rating history';
      try {
        if (err?.response?.data?.detail) {
          errorMsg = String(err.response.data.detail);
        } else if (err?.response?.data?.message) {
          errorMsg = String(err.response.data.message);
        } else if (err?.message) {
          errorMsg = String(err.message);
        } else if (typeof err === 'string') {
          errorMsg = err;
        } else if (err) {
          errorMsg = 'Unknown error occurred';
        }
      } catch (e) {
        errorMsg = 'Unknown error occurred';
      }
      
      setError(errorMsg);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const loadCompareRatingHistory = async () => {
    if (!compareUsername) return;
    
    setCompareLoading(true);
    
    try {
      const params: any = { mode };
      
      if (startDate && startDate.trim()) {
        params.start = startDate;
      }
      if (endDate && endDate.trim()) {
        params.end = endDate;
      }

      const response = await api.get(`/api/public/accounts/${compareUsername}/rating-history/`, { params });
      const data = response.data;
      
      if (!data) {
        throw new Error('No data received from API');
      }
      
      const history = data?.history || [];
      const currentRating = data?.current_rating || 800;
      
      const sortedHistory = [...history].sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      
      let compareRatingHistory: (RatingPoint & { formattedDate: string; originalDate: string })[] = sortedHistory.map((entry: any) => ({
        formattedDate: new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        originalDate: entry.date,
        date: new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        rating: entry.rating,
        gameId: 0
      }));
      
      if (compareRatingHistory.length === 0) {
        const today = new Date();
        compareRatingHistory = [{
          formattedDate: today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          originalDate: today.toISOString().split('T')[0],
          date: today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          rating: currentRating,
          gameId: 0
        }];
      }
      
      // Find max rating for comparison user
      const compareMaxRating = compareRatingHistory.length > 0 
        ? Math.max(...compareRatingHistory.map(p => p.rating))
        : currentRating;
      
      // Find the newest point with max rating
      const compareMaxPoints = compareRatingHistory
        .filter(p => p.rating === compareMaxRating)
        .sort((a, b) => new Date(b.originalDate).getTime() - new Date(a.originalDate).getTime());
      const compareNewestMax = compareMaxPoints.length > 0 ? compareMaxPoints[0] : null;
      
      // Mark max point and convert to RatingPoint format
      const compareDataWithMax: RatingPoint[] = compareRatingHistory.map((point) => ({
        date: point.formattedDate,
        rating: point.rating,
        gameId: point.gameId,
        isMax: compareNewestMax && point.originalDate === compareNewestMax.originalDate && point.rating === compareMaxRating
      }));
      
      setCompareData(compareDataWithMax);
    } catch (err: any) {
      console.error('[RatingHistoryGraph] Compare Error:', err);
      setCompareData([]);
    } finally {
      setCompareLoading(false);
    }
  };

  // Merge data for chart display
  const mergedData = useMemo(() => {
    if (!compareData.length) return data;
    
    // Create a map of dates to ratings for both users
    const dataMap = new Map<string, { 
      rating: number; 
      compareRating?: number; 
      isMax?: boolean;
      compareIsMax?: boolean;
    }>();
    
    // Find max rating for comparison user
    const compareMaxRating = compareData.length > 0 
      ? Math.max(...compareData.map(p => p.rating))
      : 0;
    
    // Find newest max point for comparison user
    const compareMaxPoints = compareData.filter(p => p.rating === compareMaxRating);
    const compareNewestMax = compareMaxPoints.length > 0 
      ? compareMaxPoints[compareMaxPoints.length - 1]
      : null;
    
    // Add main user data
    data.forEach(point => {
      const dateKey = point.date;
      dataMap.set(dateKey, {
        rating: point.rating,
        isMax: point.isMax
      });
    });
    
    // Add comparison user data
    compareData.forEach(point => {
      const dateKey = point.date;
      const existing = dataMap.get(dateKey);
      const isCompareMax = point.isMax || false;
      if (existing) {
        existing.compareRating = point.rating;
        existing.compareIsMax = isCompareMax;
      } else {
        dataMap.set(dateKey, {
          rating: 0, // Will be interpolated or shown as gap
          compareRating: point.rating,
          compareIsMax: isCompareMax
        });
      }
    });
    
    // Convert back to array and sort by date
    return Array.from(dataMap.entries())
      .map(([date, values]) => ({
        date,
        rating: values.rating,
        compareRating: values.compareRating,
        isMax: values.isMax,
        compareIsMax: values.compareIsMax,
        gameId: 0
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [data, compareData]);
  
  // Calculate max ratings for both users
  const primaryMaxRating = useMemo(() => {
    return data.length > 0 ? Math.max(...data.map(p => p.rating)) : 0;
  }, [data]);
  
  const compareMaxRating = useMemo(() => {
    return compareData.length > 0 ? Math.max(...compareData.map(p => p.rating)) : 0;
  }, [compareData]);

  const today = new Date().toISOString().split('T')[0];
  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  console.log('[RatingHistoryGraph] Rendering modal:', { username, mode, dataLength: data.length, loading, error });

  return (
    <div 
      onClick={(e) => {
        // Close on backdrop click
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}
    >
      <div 
        className="card" 
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 900,
          height: '90vh',
          maxHeight: '90vh',
          minHeight: 500,
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(160deg, rgba(22, 32, 54, 0.98), rgba(12, 18, 32, 0.98))',
          border: '1px solid rgba(44, 230, 194, 0.3)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
          position: 'relative',
          zIndex: 10001,
          padding: '24px',
          borderRadius: '12px',
          overflow: 'hidden'
        }}
      >
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: 24, 
          flexShrink: 0, 
          paddingBottom: 20, 
          borderBottom: '2px solid rgba(44, 230, 194, 0.2)',
          background: 'linear-gradient(135deg, rgba(44, 230, 194, 0.05) 0%, rgba(12, 18, 32, 0.05) 100%)',
          padding: '20px 24px',
          marginLeft: '-24px',
          marginRight: '-24px',
          marginTop: '-24px',
          borderRadius: '12px 12px 0 0'
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: mode === 'bullet' ? 'linear-gradient(135deg, #ef5350, #d32f2f)' :
                           mode === 'blitz' ? 'linear-gradient(135deg, #9b59b6, #7d3c98)' :
                           mode === 'rapid' ? 'linear-gradient(135deg, #3498db, #2980b9)' :
                           'linear-gradient(135deg, #2ecc71, #27ae60)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                flexShrink: 0
              }}>
                {mode === 'bullet' ? '⚡' : mode === 'blitz' ? '⚔️' : mode === 'rapid' ? '🏃' : '📚'}
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ 
                  margin: 0, 
                  fontSize: 28, 
                  fontWeight: 800,
                  background: mode === 'bullet' ? 'linear-gradient(135deg, #ef5350, #ff6b6b)' :
                             mode === 'blitz' ? 'linear-gradient(135deg, #9b59b6, #bb86fc)' :
                             mode === 'rapid' ? 'linear-gradient(135deg, #3498db, #5dade2)' :
                             'linear-gradient(135deg, #2ecc71, #58d68d)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  letterSpacing: '-0.5px',
                  marginBottom: 4
                }}>
                  {mode.charAt(0).toUpperCase() + mode.slice(1)} Rating History
                </h2>
                <div style={{ 
                  fontSize: 13, 
                  color: 'var(--muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}>
                  <span>📈</span>
                  <span>Track your rating progression over time</span>
                </div>
              </div>
            </div>
            {data.length > 0 && (
              <div style={{ 
                display: 'flex', 
                gap: 16, 
                marginTop: 16,
                paddingTop: 16,
                borderTop: '1px solid rgba(44, 230, 194, 0.1)',
                flexWrap: 'wrap'
              }}>
                {/* Primary User Stats */}
                <div style={{
                  padding: '10px 16px',
                  background: 'linear-gradient(135deg, rgba(46, 204, 113, 0.15), rgba(46, 204, 113, 0.05))',
                  border: '1px solid rgba(46, 204, 113, 0.3)',
                  borderRadius: 8,
                  minWidth: 140,
                  flex: '1 1 auto'
                }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                    {username}
                  </div>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Current</div>
                      <div style={{ 
                        fontSize: 20, 
                        fontWeight: 700,
                        color: '#2ecc71',
                      }}>
                        {data[data.length - 1]?.rating || 0}
                      </div>
                    </div>
                    {primaryMaxRating > 0 && (
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Peak</div>
                        <div style={{ 
                          fontSize: 20, 
                          fontWeight: 700,
                          color: '#f5c451',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}>
                          <span>⭐</span>
                          <span>{primaryMaxRating}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Comparison User Stats */}
                {compareUsername && compareData.length > 0 && (
                  <div style={{
                    padding: '10px 16px',
                    background: 'linear-gradient(135deg, rgba(255, 107, 107, 0.15), rgba(255, 107, 107, 0.05))',
                    border: '1px solid rgba(255, 107, 107, 0.3)',
                    borderRadius: 8,
                    minWidth: 140,
                    flex: '1 1 auto'
                  }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                      {compareUsername}
                    </div>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Current</div>
                        <div style={{ 
                          fontSize: 20, 
                          fontWeight: 700,
                          color: '#ff6b6b',
                        }}>
                          {compareData[compareData.length - 1]?.rating || 0}
                        </div>
                      </div>
                      {compareMaxRating > 0 && (
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Peak</div>
                          <div style={{ 
                            fontSize: 20, 
                            fontWeight: 700,
                            color: '#f5c451',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}>
                            <span>⭐</span>
                            <span>{compareMaxRating}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={{ 
              fontSize: 20, 
              padding: '8px 12px', 
              flexShrink: 0,
              borderRadius: 8,
              transition: 'all 0.2s ease',
              opacity: 0.7
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0.7';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            ✕
          </button>
        </div>
        
        <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 13, color: 'var(--muted)' }}>From:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              max={endDate || today}
              style={{
                padding: '6px 10px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text)',
                fontSize: 13
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 13, color: 'var(--muted)' }}>To:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate}
              max={today}
              style={{
                padding: '6px 10px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text)',
                fontSize: 13
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setStartDate(oneMonthAgo);
                setEndDate(today);
              }}
              style={{ fontSize: 12, padding: '6px 12px' }}
            >
              Last Month
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setStartDate(oneYearAgo);
                setEndDate(today);
              }}
              style={{ fontSize: 12, padding: '6px 12px' }}
            >
              Last Year
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              style={{ fontSize: 12, padding: '6px 12px' }}
            >
              All Time
            </button>
          </div>
          
          {/* Compare with user */}
          <div style={{ position: 'relative', marginLeft: 'auto' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: 13, color: 'var(--muted)' }}>Compare:</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Search user..."
                  value={compareUsername || userSearch}
                  onChange={(e) => {
                    const value = e.target.value;
                    setUserSearch(value);
                    if (value.trim().length >= 2) {
                      setShowUserSearch(true);
                    } else {
                      setShowUserSearch(false);
                    }
                    if (!value) {
                      setCompareUsername('');
                    }
                  }}
                  onFocus={() => {
                    if (userSearch.trim().length >= 2) {
                      setShowUserSearch(true);
                    }
                  }}
                  style={{
                    padding: '6px 10px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    color: 'var(--text)',
                    fontSize: 13,
                    width: 180
                  }}
                />
                {compareUsername && (
                  <button
                    onClick={() => {
                      setCompareUsername('');
                      setUserSearch('');
                      setShowUserSearch(false);
                    }}
                    style={{
                      position: 'absolute',
                      right: 4,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--muted)',
                      cursor: 'pointer',
                      padding: '2px 6px',
                      fontSize: 16
                    }}
                  >
                    ✕
                  </button>
                )}
                {showUserSearch && userSearch.trim().length >= 2 && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: 4,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    maxHeight: 200,
                    overflowY: 'auto',
                    zIndex: 10002,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
                  }}>
                    {userSearchLoading ? (
                      <div style={{ padding: '12px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                        Searching...
                      </div>
                    ) : userSearchResults.length > 0 ? (
                      userSearchResults.map((user) => (
                        <div
                          key={user.id}
                          onClick={() => {
                            setCompareUsername(user.username || '');
                            setUserSearch(user.username || '');
                            setShowUserSearch(false);
                          }}
                          style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--border)',
                            transition: 'background 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(44, 230, 194, 0.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <div style={{ fontWeight: 500, color: 'var(--text)' }}>{user.username}</div>
                        </div>
                      ))
                    ) : userSearch.trim().length >= 2 && !userSearchLoading ? (
                      <div style={{ padding: '12px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                        No users found
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Click outside to close user search */}
        {showUserSearch && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999
            }}
            onClick={() => setShowUserSearch(false)}
          />
        )}

        <div style={{ flex: '1 1 auto', minHeight: 400, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
              Loading rating history...
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--danger)' }}>
              <div style={{ marginBottom: 8 }}>Error: {error}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Check console for details
              </div>
            </div>
          ) : data.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
              <div style={{ marginBottom: 8 }}>No rating history found for {mode}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Rating snapshots will be stored daily
              </div>
            </div>
          ) : (
            <div style={{ width: '100%', height: '100%', minHeight: 400, flex: '1 1 auto', position: 'relative' }}>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={mergedData} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" opacity={0.3} />
                  <XAxis 
                    dataKey="date" 
                    stroke="var(--muted)"
                    style={{ fontSize: 11 }}
                    tick={{ fill: 'var(--muted)' }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis 
                    stroke="var(--muted)"
                    style={{ fontSize: 11 }}
                    tick={{ fill: 'var(--muted)' }}
                    label={{ 
                      value: 'Rating', 
                      angle: -90, 
                      position: 'insideLeft', 
                      style: { fill: 'var(--text)', fontSize: 12 } 
                    }}
                    domain={['dataMin - 50', 'dataMax + 50']}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'rgba(22, 32, 54, 0.98)',
                      border: '1px solid rgba(44, 230, 194, 0.3)',
                      borderRadius: '8px',
                      color: 'var(--text)',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)'
                    }}
                    formatter={(value: number, name: string) => {
                      // Only show rating, hide maxRating
                      if (name === 'maxRating') {
                        return null;
                      }
                      const color = name === 'compareRating' ? '#ff6b6b' : '#2ecc71';
                      return (
                        <span style={{ color, fontWeight: 600 }}>
                          {value}
                        </span>
                      );
                    }}
                    labelStyle={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 4 }}
                  />
                  
                  {/* Main rating line - Green for primary user */}
                  <Line 
                    type="monotone" 
                    dataKey="rating" 
                    stroke="#2ecc71" 
                    strokeWidth={3}
                    name={username}
                    dot={(props: any) => {
                      const { cx, cy, payload } = props;
                      if (payload.isMax) {
                        return (
                          <g key={`max-${cx}-${cy}`}>
                            <circle 
                              cx={cx} 
                              cy={cy} 
                              r={8} 
                              fill="#f5c451" 
                              stroke="#fff" 
                              strokeWidth={2}
                              style={{ filter: 'drop-shadow(0 0 4px rgba(245, 196, 81, 0.8))' }}
                            />
                            <circle 
                              cx={cx} 
                              cy={cy} 
                              r={4} 
                              fill="#fff"
                            />
                          </g>
                        );
                      }
                      return (
                        <circle 
                          cx={cx} 
                          cy={cy} 
                          r={3} 
                          fill="#2ecc71" 
                          stroke="rgba(22, 32, 54, 0.8)" 
                          strokeWidth={1.5}
                        />
                      );
                    }}
                    activeDot={{ 
                      r: 8, 
                      fill: '#2ecc71',
                      stroke: '#fff',
                      strokeWidth: 2,
                      style: { filter: 'drop-shadow(0 0 6px rgba(46, 204, 113, 0.8))' }
                    }}
                  />
                  
                  {/* Comparison user rating line - Red for secondary user */}
                  {compareUsername && (
                    <Line 
                      type="monotone" 
                      dataKey="compareRating" 
                      stroke="#ff6b6b" 
                      strokeWidth={3}
                      name={compareUsername}
                      dot={(props: any) => {
                        const { cx, cy, payload } = props;
                        if (payload.compareIsMax) {
                          return (
                            <g key={`compare-max-${cx}-${cy}`}>
                              <circle 
                                cx={cx} 
                                cy={cy} 
                                r={8} 
                                fill="#f5c451" 
                                stroke="#fff" 
                                strokeWidth={2}
                                style={{ filter: 'drop-shadow(0 0 4px rgba(245, 196, 81, 0.8))' }}
                              />
                              <circle 
                                cx={cx} 
                                cy={cy} 
                                r={4} 
                                fill="#fff"
                              />
                            </g>
                          );
                        }
                        return (
                          <circle 
                            cx={cx} 
                            cy={cy} 
                            r={3} 
                            fill="#ff6b6b" 
                            stroke="rgba(22, 32, 54, 0.8)" 
                            strokeWidth={1.5}
                          />
                        );
                      }}
                      activeDot={{ 
                        r: 8, 
                        fill: '#ff6b6b',
                        stroke: '#fff',
                        strokeWidth: 2,
                        style: { filter: 'drop-shadow(0 0 6px rgba(255, 107, 107, 0.8))' }
                      }}
                    />
                  )}
                  
                  {/* Reference line for max rating - hidden from tooltip */}
                  {data.some(p => p.isMax) && (
                    <Line
                      type="monotone"
                      dataKey="maxRating"
                      stroke="#f5c451"
                      strokeWidth={1}
                      strokeDasharray="5 5"
                      dot={false}
                      legendType="none"
                      opacity={0.5}
                      hide={true}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

