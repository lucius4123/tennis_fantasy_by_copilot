'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useParams } from 'next/navigation';

interface FantasyTeam {
  id: string;
  name: string;
  total_points_scored: number;
  user_id: string;
  profile_image_url?: string | null;
}

interface Auction {
  id: string;
  player_id: string;
  end_time: string;
  seller_team_id?: string | null;
  highest_bidder_id?: string | null;
  highest_bid?: number;
  player: { first_name: string; last_name: string; ranking: number; country: string; image_url?: string };
  appearance_probability?: string;
  market_value?: number;
  my_bid?: number;
  seller_team_image_url?: string | null;
}

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  ranking: number;
  country: string;
  image_url?: string;
  appearance_probability?: string;
}

interface PlayerMatch {
  id: string;
  tournament_name: string;
  opponent_name: string;
  match_result: string;
  match_date: string;
  fantasy_points: number;
  aces: number;
  double_faults: number;
  break_points_won: number;
  net_points_won: number;
  breaks_conceded: number;
  winners: number;
  unforced_errors: number;
}

interface Tournament {
  id: string;
  name: string;
  start_date: string;
  status?: 'upcoming' | 'on-going' | 'completed';
}

interface LeagueNews {
  id: string;
  title: string;
  message: string;
  created_at: string;
  team_id?: string | null;
  team_image_url?: string | null;
}

interface PlayerSalesHistoryEntry {
  id: string;
  seller_team_id: string | null;
  buyer_team_id: string | null;
  player_id: string;
  sale_price: number;
  sale_type: 'market_sale' | 'auction_win';
  created_at: string;
}

interface TeamInspection {
  team: FantasyTeam;
  squad: Player[];
  lineup: Player[];
}

type LineupSlot = Player | null;

export default function LeaguePage() {
  const params = useParams();
  const leagueId = params.id as string;
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState('leaderboard');
  const [leaderboard, setLeaderboard] = useState<FantasyTeam[]>([]);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [myTeam, setMyTeam] = useState<Player[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [user, setUser] = useState<any>(null);
  const [myTeamId, setMyTeamId] = useState<string>('');
  const [activeTournamentId, setActiveTournamentId] = useState<string>('');
  const [activeTournament, setActiveTournament] = useState<Tournament | null>(null);
  const [lineupSlots, setLineupSlots] = useState<LineupSlot[]>([null, null, null, null, null]);
  const [draggedPlayerId, setDraggedPlayerId] = useState<string | null>(null);
  const [draggedFromSlot, setDraggedFromSlot] = useState<number | null>(null);
  const [historyPlayer, setHistoryPlayer] = useState<Player | null>(null);
  const [historyMatches, setHistoryMatches] = useState<PlayerMatch[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [news, setNews] = useState<LeagueNews[]>([]);
  const [lastSeenNewsAt, setLastSeenNewsAt] = useState<string | null>(null);
  const [timeTick, setTimeTick] = useState(0);
  const [playerTournamentPoints, setPlayerTournamentPoints] = useState<Map<string, number>>(new Map());
  const [myBudget, setMyBudget] = useState<number | null>(null);
  const [teamInspection, setTeamInspection] = useState<TeamInspection | null>(null);
  const [teamInspectionLoading, setTeamInspectionLoading] = useState(false);
  const [playerToSell, setPlayerToSell] = useState<Player | null>(null);
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [sellLoading, setSellLoading] = useState(false);
  const [playerMarketValues, setPlayerMarketValues] = useState<Map<string, number>>(new Map());
  const [isLineupEditMode, setIsLineupEditMode] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedFromSlot, setSelectedFromSlot] = useState<number | null>(null);
  const [isTouchDragActive, setIsTouchDragActive] = useState(false);
  const courtContainerRef = useRef<HTMLDivElement | null>(null);
  const touchDragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPointRef = useRef<{ x: number; y: number } | null>(null);

  // Helper function to get icon for appearance probability
  const getProbabilityIcon = (probability?: string) => {
    if (!probability) return { icon: '❓', color: 'text-gray-400', label: 'Unbekannt' };
    
    switch (probability) {
      case 'Garantiert':
        return { icon: '✓', color: 'text-green-600', label: 'Garantiert' };
      case 'Sehr Wahrscheinlich':
        return { icon: '↗', color: 'text-green-500', label: 'Sehr Wahrscheinlich' };
      case 'Wahrscheinlich':
        return { icon: '→', color: 'text-yellow-500', label: 'Wahrscheinlich' };
      case 'Riskant':
        return { icon: '↘', color: 'text-orange-500', label: 'Riskant' };
      case 'Sehr Riskant':
        return { icon: '⚠', color: 'text-red-500', label: 'Sehr Riskant' };
      case 'Ausgeschlossen':
        return { icon: '✕', color: 'text-zinc-500', label: 'Ausgeschlossen' };
      default:
        return { icon: '❓', color: 'text-gray-400', label: 'Unbekannt' };
    }
  };

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('Current user:', user);
      console.log('League ID from params:', leagueId);
      setUser(user);
      if (user) {
        const { data: team, error } = await supabase
          .from('fantasy_teams')
          .select('id, budget')
          .eq('user_id', user.id)
          .eq('league_id', leagueId)
          .single();
        console.log('Team query result:', team, 'error:', error);
        setMyTeamId(team?.id || '');
        if (team?.budget != null) setMyBudget(team.budget);
      }
    };
    getUser();
  }, [leagueId]);

  useEffect(() => {
    if (user) {
      loadActiveTournament();
      loadLeaderboard();
      loadTournaments();
    }
  }, [user, leagueId]);

  useEffect(() => {
    if (user && activeTournamentId) {
      loadAuctions();
      loadPlayerTournamentPoints();
      if (myTeamId) {
        loadMyTeam();
        loadCurrentLineup();
        loadNews();
      }
    }
  }, [user, leagueId, myTeamId, activeTournamentId]);

  useEffect(() => {
    const channel = supabase.channel('auctions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'market_auctions', filter: `league_id=eq.${leagueId}` }, async () => {
        await loadAuctions();
      })
      .subscribe();
    return () => {
  supabase.removeChannel(channel); // Jetzt wird das Promise ignoriert und der Fehler verschwindet.
};
  }, [leagueId]);

  useEffect(() => {
    const timer = setInterval(() => setTimeTick((v) => v + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!leagueId) return;
    const storageKey = `league-news-last-seen-${leagueId}`;
    const storedValue = window.localStorage.getItem(storageKey);
    setLastSeenNewsAt(storedValue);
  }, [leagueId]);

  useEffect(() => {
    if (!leagueId || activeTab !== 'news') return;
    const storageKey = `league-news-last-seen-${leagueId}`;
    const nowIso = new Date().toISOString();
    window.localStorage.setItem(storageKey, nowIso);
  }, [leagueId, activeTab]);

  useEffect(() => {
    if (!isLineupEditMode) return;
    courtContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [isLineupEditMode]);

  useEffect(() => {
    if (!isLineupEditMode || activeTab !== 'tournaments') return;

    const previousOverflow = document.body.style.overflow;
    const previousOverscrollBehavior = document.body.style.overscrollBehavior;

    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscrollBehavior;
    };
  }, [isLineupEditMode, activeTab]);

  const loadLeaderboard = async () => {
    const { data } = await supabase
      .from('fantasy_teams')
      .select('id, name, total_points_scored, user_id, profile_image_url')
      .eq('league_id', leagueId)
      .order('total_points_scored', { ascending: false });
    setLeaderboard(data || []);
  };

  const loadActiveTournament = async () => {
    const { data } = await supabase
      .from('tournaments')
      .select('id, name, start_date, status')
      .eq('is_active', true)
      .single();
    
    if (data) {
      setActiveTournamentId(data.id);
      setActiveTournament(data);
    }
  };

  const loadCurrentLineup = async () => {
    if (!myTeamId || !activeTournamentId) return;

    const { data } = await supabase
      .from('tournament_lineups')
      .select('player:players(id, first_name, last_name, ranking, country, image_url)')
      .eq('tournament_id', activeTournamentId)
      .eq('team_id', myTeamId);

    const lineupPlayers = (data || [])
      .map((entry: any) => (Array.isArray(entry.player) ? entry.player[0] : entry.player))
      .filter(Boolean);

    const nextSlots: LineupSlot[] = [null, null, null, null, null];
    lineupPlayers.slice(0, 5).forEach((player: Player, index: number) => {
      nextSlots[index] = player;
    });

    setLineupSlots(nextSlots);
  };

  const loadPlayerTournamentPoints = async () => {
    if (!activeTournamentId) return;

    const { data: matches } = await supabase
      .from('player_matches')
      .select('player_id, fantasy_points')
      .eq('tournament_id', activeTournamentId);

    if (matches) {
      const pointsMap = new Map<string, number>();
      for (const match of matches) {
        const currentPoints = pointsMap.get(match.player_id) || 0;
        pointsMap.set(match.player_id, currentPoints + (match.fantasy_points || 0));
      }
      setPlayerTournamentPoints(pointsMap);
    }
  };

const loadAuctions = async () => {
  if (!activeTournamentId) return;

  // Ensure expired auctions are resolved immediately before rendering market.
  await fetch('/api/league/auctions/sync', { method: 'POST' });

  const { data } = await supabase
    .from('market_auctions')
    .select(`
      id, 
      player_id, 
      highest_bid,
      highest_bidder_id,
      seller_team_id,
      end_time, 
      player:players(first_name, last_name, ranking, country, image_url)
    `)
    .eq('league_id', leagueId)
    .gt('end_time', new Date().toISOString());

  if (data) {
    // Get appearance probabilities and market values for all players in active tournament
    const playerIds = data.map((auction: any) => auction.player_id);
    const { data: probabilities } = await supabase
      .from('tournament_players')
      .select('player_id, appearance_probability, market_value')
      .eq('tournament_id', activeTournamentId)
      .in('player_id', playerIds);

    const probabilityMap = new Map(
      (probabilities || []).map(p => [p.player_id, { appearance_probability: p.appearance_probability, market_value: p.market_value }])
    );

    const formattedData = data.map((auction: any) => ({
      ...auction,
      player: Array.isArray(auction.player) ? auction.player[0] : auction.player,
      appearance_probability: probabilityMap.get(auction.player_id)?.appearance_probability,
      market_value: probabilityMap.get(auction.player_id)?.market_value || 0
    }));

    const sellerTeamIds = Array.from(
      new Set(
        formattedData
          .map((auction: any) => auction.seller_team_id)
          .filter((teamId: string | null | undefined): teamId is string => Boolean(teamId))
      )
    );

    let sellerTeamImageMap = new Map<string, string | null>();
    if (sellerTeamIds.length > 0) {
      const { data: sellerTeams } = await supabase
        .from('fantasy_teams')
        .select('id, profile_image_url')
        .in('id', sellerTeamIds);

      sellerTeamImageMap = new Map(
        (sellerTeams || []).map((team: any) => [team.id, team.profile_image_url || null])
      );
    }

    const auctionsWithSellerImages = formattedData.map((auction: any) => ({
      ...auction,
      seller_team_image_url: auction.seller_team_id ? (sellerTeamImageMap.get(auction.seller_team_id) || null) : null,
    }));

    const sortedData = [...auctionsWithSellerImages].sort(
      (left: any, right: any) => new Date(left.end_time).getTime() - new Date(right.end_time).getTime()
    );

    if (myTeamId) {
      const auctionIds = sortedData.map((a: any) => a.id);
      const { data: myBids } = await supabase
        .from('market_bids')
        .select('auction_id, bid_amount')
        .eq('team_id', myTeamId)
        .in('auction_id', auctionIds);

      const myBidMap = new Map((myBids || []).map((bid: any) => [bid.auction_id, bid.bid_amount]));
      setAuctions(sortedData.map((auction: any) => ({ ...auction, my_bid: myBidMap.get(auction.id) })));
      return;
    }
    
    setAuctions(sortedData);
  }
};

  const loadNews = async () => {
    if (!leagueId) return;
    const { data: baseNews } = await supabase
      .from('league_news')
      .select('id, title, message, created_at, team_id')
      .eq('league_id', leagueId)
      .or(`team_id.is.null,team_id.eq.${myTeamId}`)
      .order('created_at', { ascending: false })
      .limit(50);

    const { data: salesRows } = await supabase
      .from('player_sales_history')
      .select('id, seller_team_id, buyer_team_id, player_id, sale_price, sale_type, created_at')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false })
      .limit(50);

    const sales = (salesRows as PlayerSalesHistoryEntry[]) || [];

    const playerIds = Array.from(new Set(sales.map((row) => row.player_id)));
    const salesTeamIds = sales
      .flatMap((row) => [row.seller_team_id, row.buyer_team_id])
      .filter((id): id is string => Boolean(id));
    const baseNewsTeamIds = (((baseNews as LeagueNews[]) || []).map((entry) => entry.team_id || null))
      .filter((id): id is string => Boolean(id));
    const teamIds = Array.from(new Set([...salesTeamIds, ...baseNewsTeamIds]));

    let playerNameById = new Map<string, string>();
    if (playerIds.length > 0) {
      const { data: players } = await supabase
        .from('players')
        .select('id, first_name, last_name')
        .in('id', playerIds);

      playerNameById = new Map(
        (players || []).map((player: any) => [player.id, `${player.first_name} ${player.last_name}`])
      );
    }

    let teamNameById = new Map<string, string>();
    if (teamIds.length > 0) {
      const { data: teams } = await supabase
        .from('fantasy_teams')
        .select('id, name, profile_image_url')
        .in('id', teamIds);

      teamNameById = new Map((teams || []).map((team: any) => [team.id, team.name]));
      const teamImageById = new Map((teams || []).map((team: any) => [team.id, team.profile_image_url || null]));

      const baseNewsWithImages = (((baseNews as LeagueNews[]) || []).map((entry) => ({
        ...entry,
        team_image_url: entry.team_id ? (teamImageById.get(entry.team_id) || null) : null,
      })));

      const salesAsNews: LeagueNews[] = sales.map((row) => {
        const playerName = playerNameById.get(row.player_id) || 'Spieler';
        const sellerName = row.seller_team_id ? (teamNameById.get(row.seller_team_id) || 'Team') : 'Markt';
        const buyerName = row.buyer_team_id ? (teamNameById.get(row.buyer_team_id) || 'Team') : 'Markt';
        const priceText = Number(row.sale_price || 0).toLocaleString('de-DE');
        const sellerImage = row.seller_team_id ? (teamImageById.get(row.seller_team_id) || null) : null;

        if (row.sale_type === 'market_sale') {
          return {
            id: `sale-${row.id}`,
            title: 'Spieler an Markt verkauft',
            message: `${sellerName} hat ${playerName} für ${priceText}€ an den Markt verkauft.`,
            created_at: row.created_at,
            team_id: row.seller_team_id,
            team_image_url: sellerImage,
          };
        }

        return {
          id: `sale-${row.id}`,
          title: 'Transfer abgeschlossen',
          message: `${buyerName} hat ${playerName} von ${sellerName} für ${priceText}€ gekauft.`,
          created_at: row.created_at,
          team_id: row.seller_team_id,
          team_image_url: sellerImage,
        };
      });

      const mergedNews = [...baseNewsWithImages, ...salesAsNews]
        .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
        .slice(0, 50);

      setNews(mergedNews);
      return;
    }

    setNews((baseNews as LeagueNews[]) || []);
  };

  const uploadTeamProfileImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !myTeamId) return;

    if (file.size > 1024 * 1024) {
      alert('Das Profilbild darf maximal 1MB groß sein.');
      event.target.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('teamId', myTeamId);
    formData.append('leagueId', leagueId);

    try {
      const response = await fetch('/api/upload-team-image', {
        method: 'POST',
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok) {
        alert(payload?.error || 'Profilbild konnte nicht hochgeladen werden.');
        return;
      }

      await loadLeaderboard();
      await loadAuctions();
      await loadNews();
      alert('Profilbild erfolgreich hochgeladen.');
    } catch (error) {
      console.error('Upload error:', error);
      alert('Profilbild konnte nicht hochgeladen werden.');
    } finally {
      event.target.value = '';
    }
  };

  const loadTeamPlayers = async (teamId: string) => {
    if (!teamId) return [] as Player[];

    const { data: teamPlayers, error: teamPlayersError } = await supabase
      .from('team_players')
      .select('player_id')
      .eq('team_id', teamId);

    if (teamPlayersError || !teamPlayers || teamPlayers.length === 0) {
      if (teamPlayersError) {
        console.error('Failed to load team players:', teamPlayersError);
      }
      return [] as Player[];
    }

    const playerIds = teamPlayers.map((teamPlayer: { player_id: string }) => teamPlayer.player_id);
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('id, first_name, last_name, ranking, country, image_url')
      .in('id', playerIds);

    if (playersError || !players) {
      if (playersError) {
        console.error('Failed to load player details:', playersError);
      }
      return [] as Player[];
    }

    const probabilityMap = new Map<string, string>();
    if (activeTournamentId) {
      const { data: probabilities, error: probabilitiesError } = await supabase
        .from('tournament_players')
        .select('player_id, appearance_probability')
        .eq('tournament_id', activeTournamentId)
        .in('player_id', playerIds);

      if (probabilitiesError) {
        console.error('Failed to load appearance probabilities:', probabilitiesError);
      }

      for (const probability of probabilities || []) {
        probabilityMap.set(probability.player_id, probability.appearance_probability);
      }
    }

    return [...players]
      .map((player) => ({
        ...player,
        appearance_probability: probabilityMap.get(player.id),
      }))
      .sort((left, right) => left.ranking - right.ranking);
  };

  const loadMyTeam = async () => {
    if (!myTeamId || !activeTournamentId) {
      console.log('No myTeamId or activeTournamentId');
      return;
    }
    console.log('Loading team for myTeamId:', myTeamId);
    const playersWithProbability = await loadTeamPlayers(myTeamId);
    setMyTeam(playersWithProbability);

    // Load market values for all players
    const playerIds = playersWithProbability.map((p: Player) => p.id);
    const { data: marketData } = await supabase
      .from('tournament_players')
      .select('player_id, market_value')
      .eq('tournament_id', activeTournamentId)
      .in('player_id', playerIds);

    const marketMap = new Map((marketData || []).map(m => [m.player_id, m.market_value]));
    setPlayerMarketValues(marketMap);
  };

  const offerPlayerForSale = async (player: Player) => {
    if (!myTeamId || !leagueId) return;

    setSellLoading(true);
    try {
      const response = await fetch('/api/league/player-sales/offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: player.id, leagueId, daysUntilExpiration: 7 }),
      });

      const payload = await response.json();
      if (!response.ok) {
        alert(payload?.error || 'Spieler konnte nicht angeboten werden');
        return;
      }

      alert(`${player.first_name} ${player.last_name} wurde auf dem Transfermarkt angeboten!`);
      await loadMyTeam();
      await loadAuctions();
      setPlayerToSell(null);
      setShowSaleModal(false);
    } catch (error) {
      console.error('Error offering player for sale:', error);
      alert('Ein Fehler ist aufgetreten beim Anbieten des Spielers');
    } finally {
      setSellLoading(false);
    }
  };

  const sellPlayerToMarket = async (player: Player) => {
    if (!myTeamId || !leagueId) return;

    setSellLoading(true);
    try {
      const response = await fetch('/api/league/player-sales/sell-to-market', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: player.id, leagueId }),
      });

      const payload = await response.json();
      if (!response.ok) {
        alert(payload?.error || 'Spieler konnte nicht verkauft werden');
        return;
      }

      const marketValue = playerMarketValues.get(player.id) || 0;
      alert(`${player.first_name} ${player.last_name} wurde für ${marketValue.toLocaleString('de-DE')}€ verkauft!`);
      await loadMyTeam();
      
      // Refresh budget
      const { data: updatedTeam } = await supabase
        .from('fantasy_teams')
        .select('budget')
        .eq('id', myTeamId)
        .single();
      if (updatedTeam?.budget != null) setMyBudget(updatedTeam.budget);

      setPlayerToSell(null);
      setShowSaleModal(false);
    } catch (error) {
      console.error('Error selling player to market:', error);
      alert('Ein Fehler ist aufgetreten beim Verkaufen des Spielers');
    } finally {
      setSellLoading(false);
    }
  };

  const loadTournaments = async () => {
    const { data } = await supabase
      .from('tournaments')
      .select('id, name, start_date')
      .eq('is_active', true)
      .gt('start_date', new Date().toISOString())
      .order('start_date', { ascending: true });
    setTournaments(data || []);
  };

  const withdrawBid = async (auctionId: string) => {
    if (!myTeamId) return;
    const response = await fetch('/api/league/auctions/bid', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auctionId, leagueId }),
    });
    const payload = await response.json();
    if (!response.ok) {
      alert(payload?.error || 'Gebot konnte nicht zurückgezogen werden');
      return;
    }
    await loadAuctions();
  };

  const placeBid = async (auctionId: string, bidAmount: number) => {
    if (!myTeamId) return;
    if (!Number.isFinite(bidAmount) || bidAmount <= 0) {
      alert('Bitte ein gültiges Gebot eingeben.');
      return;
    }
    const auction = auctions.find(a => a.id === auctionId);
    if (auction?.seller_team_id === myTeamId) {
      alert('Du kannst nicht auf deine eigenen angebotenen Spieler bieten.');
      return;
    }
    const otherBidsTotal = auctions
      .filter(a => a.id !== auctionId)
      .reduce((sum, a) => sum + (a.my_bid || 0), 0);
    if (myBudget !== null && otherBidsTotal + bidAmount > myBudget) {
      alert(`Deine gesamten Gebote (${(otherBidsTotal + bidAmount).toLocaleString('de-DE')}€) würden dein Budget von ${myBudget.toLocaleString('de-DE')}€ überschreiten.`);
      return;
    }
    const response = await fetch('/api/league/auctions/bid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auctionId, bidAmount, leagueId }),
    });

    const payload = await response.json();
    if (!response.ok) {
      alert(payload?.error || 'Gebot fehlgeschlagen');
      return;
    }

    // Refresh budget after successful bid
    const { data: updatedTeam } = await supabase
      .from('fantasy_teams')
      .select('budget')
      .eq('id', myTeamId)
      .single();
    if (updatedTeam?.budget != null) setMyBudget(updatedTeam.budget);

    await loadAuctions();
  };

  const acceptHighestBid = async (auctionId: string) => {
    if (!myTeamId) return;

    const response = await fetch('/api/league/player-sales/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auctionId, leagueId }),
    });

    const payload = await response.json();
    if (!response.ok) {
      alert(payload?.error || 'Gebot konnte nicht angenommen werden');
      return;
    }

    alert(`Gebot angenommen: ${Number(payload?.winningAmount || 0).toLocaleString('de-DE')}€`);

    const { data: updatedTeam } = await supabase
      .from('fantasy_teams')
      .select('budget')
      .eq('id', myTeamId)
      .single();

    if (updatedTeam?.budget != null) setMyBudget(updatedTeam.budget);

    await loadAuctions();
    await loadMyTeam();
    await loadNews();
  };

  const cancelPlayerSale = async (auctionId: string) => {
    if (!myTeamId) return;

    const response = await fetch('/api/league/player-sales/cancel', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auctionId, leagueId }),
    });

    const payload = await response.json();
    if (!response.ok) {
      alert(payload?.error || 'Angebot konnte nicht storniert werden');
      return;
    }

    alert('Angebot wurde storniert. Der Spieler ist wieder in deinem Team.');

    await loadAuctions();
    await loadMyTeam();
    await loadNews();
  };

  const getRemainingTime = (endTime: string) => {
    void timeTick;
    const diffMs = new Date(endTime).getTime() - Date.now();
    if (diffMs <= 0) return { label: 'Abgelaufen', urgent: true };

    const totalMinutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours >= 1) {
      return { label: `${hours}h`, urgent: false };
    }

    if (totalMinutes < 10) {
      return { label: `${Math.max(totalMinutes, 0)}min`, urgent: true };
    }

    return { label: `${Math.max(totalMinutes, 0)}min`, urgent: false };
  };

  const getLineupDeadlineRemaining = (startDate: string) => {
    void timeTick;
    const diffMs = new Date(startDate).getTime() - Date.now();

    if (diffMs <= 0) {
      return { label: 'Aufstellung geschlossen', urgent: true };
    }

    const oneDayMs = 24 * 60 * 60 * 1000;
    if (diffMs >= oneDayMs) {
      const daysLeft = Math.ceil(diffMs / oneDayMs);
      return { label: `${daysLeft} Tag${daysLeft === 1 ? '' : 'e'}`, urgent: false };
    }

    const hoursLeft = Math.ceil(diffMs / (60 * 60 * 1000));
    return { label: `${hoursLeft} Stunde${hoursLeft === 1 ? '' : 'n'}`, urgent: true };
  };

  const isNewsEntryNew = (createdAt: string) => {
    if (!lastSeenNewsAt) return true;
    return new Date(createdAt).getTime() > new Date(lastSeenNewsAt).getTime();
  };

  const saveLineup = async (nextSlots: LineupSlot[]) => {
    if (!myTeamId || !activeTournamentId) return;

    const selectedPlayers = nextSlots.filter(Boolean).map((player) => (player as Player).id);

    await supabase
      .from('tournament_lineups')
      .delete()
      .eq('tournament_id', activeTournamentId)
      .eq('team_id', myTeamId);

    if (selectedPlayers.length === 0) return;

    const inserts = selectedPlayers.map((playerId) => ({
      tournament_id: activeTournamentId,
      team_id: myTeamId,
      player_id: playerId,
    }));

    await supabase.from('tournament_lineups').insert(inserts);
  };

  const applyLineupUpdate = async (nextSlots: LineupSlot[]) => {
    // Block lineup changes if tournament is on-going
    if (activeTournament?.status === 'on-going') {
      alert('Aufstellungsänderungen sind nicht mehr möglich, da das Turnier bereits läuft!');
      return;
    }
    
    setLineupSlots(nextSlots);
    await saveLineup(nextSlots);
  };

  const closeLineupEditMode = () => {
    if (touchDragTimerRef.current) {
      clearTimeout(touchDragTimerRef.current);
      touchDragTimerRef.current = null;
    }
    touchStartPointRef.current = null;
    setIsLineupEditMode(false);
    setDraggedPlayerId(null);
    setDraggedFromSlot(null);
    setSelectedPlayerId(null);
    setSelectedFromSlot(null);
    setIsTouchDragActive(false);
  };

  const startTouchDragCandidate = (playerId: string, fromSlot: number | null, e: React.TouchEvent) => {
    if (!isLineupEditMode) return;

    const touch = e.touches[0];
    if (!touch) return;

    if (touchDragTimerRef.current) {
      clearTimeout(touchDragTimerRef.current);
      touchDragTimerRef.current = null;
    }

    touchStartPointRef.current = { x: touch.clientX, y: touch.clientY };
    touchDragTimerRef.current = setTimeout(() => {
      setDraggedPlayerId(playerId);
      setDraggedFromSlot(fromSlot);
      setSelectedPlayerId(playerId);
      setSelectedFromSlot(fromSlot);
      setIsTouchDragActive(true);
    }, 10);
  };

  const handleTouchMoveForDrag = (e: React.TouchEvent) => {
    if (!isLineupEditMode) return;

    const touch = e.touches[0];
    const start = touchStartPointRef.current;
    if (!touch || !start) return;

    if (!isTouchDragActive) {
      const deltaX = Math.abs(touch.clientX - start.x);
      const deltaY = Math.abs(touch.clientY - start.y);
      if (deltaX > 10 || deltaY > 10) {
        if (touchDragTimerRef.current) {
          clearTimeout(touchDragTimerRef.current);
          touchDragTimerRef.current = null;
        }
      }
      return;
    }

    e.preventDefault();
  };

  const handleTouchCancelDrag = () => {
    if (touchDragTimerRef.current) {
      clearTimeout(touchDragTimerRef.current);
      touchDragTimerRef.current = null;
    }
    touchStartPointRef.current = null;
    setIsTouchDragActive(false);
    setDraggedPlayerId(null);
    setDraggedFromSlot(null);
  };

  const endTouchDrag = async (e: React.TouchEvent) => {
    if (touchDragTimerRef.current) {
      clearTimeout(touchDragTimerRef.current);
      touchDragTimerRef.current = null;
    }

    const wasTouchDragging = isTouchDragActive;
    setIsTouchDragActive(false);
    touchStartPointRef.current = null;

    if (!wasTouchDragging || !draggedPlayerId) return;

    const touch = e.changedTouches[0];
    if (!touch) return;

    const target = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null;
    const slotTarget = target?.closest('[data-lineup-slot-index]') as HTMLElement | null;
    if (slotTarget) {
      const slotIndex = Number(slotTarget.dataset.lineupSlotIndex);
      if (Number.isFinite(slotIndex)) {
        await handleDropOnSlot(slotIndex);
        return;
      }
    }

    const benchTarget = target?.closest('[data-lineup-bench]');
    if (benchTarget) {
      await handleDropOnBench();
      return;
    }

    setDraggedPlayerId(null);
    setDraggedFromSlot(null);
  };

  const handleDragStartFromBench = (playerId: string) => {
    if (!isLineupEditMode) return;
    setDraggedPlayerId(playerId);
    setDraggedFromSlot(null);
  };

  const handleDragStartFromSlot = (slotIndex: number) => {
    if (!isLineupEditMode) return;
    const player = lineupSlots[slotIndex];
    if (!player) return;
    setDraggedPlayerId(player.id);
    setDraggedFromSlot(slotIndex);
  };

  const handleDropOnSlot = async (
    slotIndex: number,
    override?: { playerId: string; fromSlot: number | null }
  ) => {
    if (!isLineupEditMode) return;

    const activeDraggedPlayerId = override?.playerId ?? draggedPlayerId;
    const activeDraggedFromSlot = override?.fromSlot ?? draggedFromSlot;
    if (!activeDraggedPlayerId) return;

    const nextSlots = [...lineupSlots];
    let movingPlayer: Player | null = null;

    if (activeDraggedFromSlot !== null) {
      movingPlayer = nextSlots[activeDraggedFromSlot];
      if (!movingPlayer) return;

      if (activeDraggedFromSlot === slotIndex) {
        setDraggedPlayerId(null);
        setDraggedFromSlot(null);
        return;
      }

      const targetPlayer = nextSlots[slotIndex];
      nextSlots[slotIndex] = movingPlayer;
      nextSlots[activeDraggedFromSlot] = targetPlayer || null;
    } else {
      movingPlayer = myTeam.find((player) => player.id === activeDraggedPlayerId) || null;
      if (!movingPlayer) return;

      const existingIndex = nextSlots.findIndex((player) => player?.id === movingPlayer?.id);
      if (existingIndex !== -1) {
        nextSlots[existingIndex] = null;
      }

      nextSlots[slotIndex] = movingPlayer;
    }

    await applyLineupUpdate(nextSlots);
    setDraggedPlayerId(null);
    setDraggedFromSlot(null);
    setSelectedPlayerId(null);
    setSelectedFromSlot(null);
  };

  const handleDropOnBench = async (overrideFromSlot?: number | null) => {
    if (!isLineupEditMode) return;

    const sourceSlot = overrideFromSlot ?? draggedFromSlot;
    if (sourceSlot === null || sourceSlot === undefined) return;

    const nextSlots = [...lineupSlots];
    nextSlots[sourceSlot] = null;
    await applyLineupUpdate(nextSlots);
    setDraggedPlayerId(null);
    setDraggedFromSlot(null);
    setSelectedPlayerId(null);
    setSelectedFromSlot(null);
  };

  const handleBenchPlayerTap = (playerId: string) => {
    if (!isLineupEditMode) return;
    setSelectedPlayerId(playerId);
    setSelectedFromSlot(null);
  };

  const handleSlotPlayerTap = (slotIndex: number) => {
    if (!isLineupEditMode) return;
    const player = lineupSlots[slotIndex];
    if (!player) return;
    setSelectedPlayerId(player.id);
    setSelectedFromSlot(slotIndex);
  };

  const handleSlotTapForPlacement = async (slotIndex: number) => {
    if (!isLineupEditMode || !selectedPlayerId) return;
    await handleDropOnSlot(slotIndex, { playerId: selectedPlayerId, fromSlot: selectedFromSlot });
  };

  const handleBenchTapForPlacement = async () => {
    if (!isLineupEditMode || selectedFromSlot === null) return;
    await handleDropOnBench(selectedFromSlot);
  };

  const openPlayerHistory = async (player: Player) => {
    setHistoryPlayer(player);
    setHistoryLoading(true);

    const { data } = await supabase
      .from('player_matches')
      .select('id, tournament_name, opponent_name, match_result, match_date, fantasy_points, aces, double_faults, break_points_won, net_points_won, breaks_conceded, winners, unforced_errors')
      .eq('player_id', player.id)
      .order('match_date', { ascending: false });

    setHistoryMatches((data as PlayerMatch[]) || []);
    setHistoryLoading(false);
  };

  const openTeamInspection = async (team: FantasyTeam) => {
    setTeamInspectionLoading(true);
    setTeamInspection({ team, squad: [], lineup: [] });

    try {
      const squad = await loadTeamPlayers(team.id);

      let lineup: Player[] = [];
      if (activeTournamentId) {
        const { data: lineupData, error: lineupError } = await supabase
          .from('tournament_lineups')
          .select('player:players(id, first_name, last_name, ranking, country, image_url)')
          .eq('tournament_id', activeTournamentId)
          .eq('team_id', team.id);

        if (lineupError) {
          console.error('Failed to load team lineup:', lineupError);
        }

        const squadMap = new Map(squad.map((player) => [player.id, player]));
        lineup = (lineupData || [])
          .map((entry: any) => (Array.isArray(entry.player) ? entry.player[0] : entry.player))
          .filter(Boolean)
          .map((player: Player) => squadMap.get(player.id) || player);
      }

      setTeamInspection({ team, squad, lineup });
    } catch (error) {
      console.error('Failed to inspect team:', error);
      setTeamInspection({ team, squad: [], lineup: [] });
    } finally {
      setTeamInspectionLoading(false);
    }
  };

  const closeTeamInspection = () => {
    setTeamInspection(null);
    setTeamInspectionLoading(false);
  };

  const notInLineupPlayers = myTeam.filter(
    (teamPlayer) => !lineupSlots.some((slotPlayer) => slotPlayer?.id === teamPlayer.id)
  );
  const inspectionLineupPositions = [
    'left-3 top-4 sm:left-8 sm:top-6',
    'right-3 top-4 sm:right-8 sm:top-6',
    'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
    'left-3 bottom-4 sm:left-8 sm:bottom-6',
    'right-3 bottom-4 sm:right-8 sm:bottom-6',
  ];

  return (
    <div className="dark-surface-scope min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Liga</h1>

      {/* tabs */}
      <nav className="mb-8 border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto">
        <div className="grid grid-flow-col auto-cols-fr gap-2 min-w-[640px]">
          {['leaderboard','auctions','myteam','tournaments','news'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`w-full pb-2 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === tab ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'}`}
            >
              {tab === 'leaderboard' ? 'Rangliste' : tab === 'auctions' ? 'Transfermarkt' : tab === 'myteam' ? 'Mein Team' : tab === 'tournaments' ? 'Turniere & Aufstellung' : 'News'}
            </button>
          ))}
        </div>
      </nav>

      {activeTab === 'leaderboard' && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Rangliste</h2>
          <ul className="space-y-2">
            {leaderboard.map((team, index) => (
              <li key={team.id}>
                <button
                  onClick={() => {
                    if (team.id !== myTeamId) {
                      openTeamInspection(team)
                    }
                  }}
                  className={`w-full flex justify-between items-center p-3 rounded-xl shadow-sm border text-left transition ${team.id === myTeamId ? 'bg-emerald-50 border-emerald-200 cursor-default' : 'bg-white border-zinc-100 hover:border-emerald-200 hover:shadow-md'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-zinc-200 border border-zinc-300 shrink-0 flex items-center justify-center">
                      {team.profile_image_url ? (
                        <img src={team.profile_image_url} alt={team.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs font-semibold text-zinc-600">{team.name?.charAt(0)?.toUpperCase() || '?'}</span>
                      )}
                    </div>
                    <span className={`w-6 text-sm font-semibold ${team.id === myTeamId ? 'text-emerald-600' : 'text-zinc-400'}`}>{index + 1}.</span>
                    <div>
                      <span className="block font-medium text-zinc-900">
                        {team.name}
                        {team.id === myTeamId ? ' (Du)' : ''}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {team.id === myTeamId ? 'Dein Team im Vergleich ansehen' : 'Kader und Aufstellung ansehen'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {team.id === myTeamId && (
                      <label className="text-xs px-2 py-1 rounded-md border border-emerald-300 text-emerald-700 hover:bg-emerald-50 cursor-pointer">
                        Profilbild
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={uploadTeamProfileImage}
                        />
                      </label>
                    )}
                    <span className="text-zinc-500">{team.total_points_scored} Punkte</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => window.location.assign('/dashboard')}
              className="px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors"
            >
              Zurueck zum Dashboard
            </button>
          </div>
        </div>
      )}

      {activeTab === 'auctions' && (
        <div>
          {(() => {
            const totalCommittedBids = auctions.reduce((sum, a) => sum + (a.my_bid || 0), 0);
            const projectedBudget = myBudget !== null ? myBudget - totalCommittedBids : null;
            return (
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Transfermarkt</h2>
                {myBudget !== null && (
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-medium px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700">
                      Budget: {myBudget.toLocaleString('de-DE')}€
                    </span>
                    {totalCommittedBids > 0 && projectedBudget !== null && (
                      <span className="text-xs font-medium px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700">
                        Nach Geboten: {projectedBudget.toLocaleString('de-DE')}€
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
          <ul className="space-y-4">
            {auctions.map(auction => {
              const probInfo = getProbabilityIcon(auction.appearance_probability);
              const remaining = getRemainingTime(auction.end_time);
              const isOwnSale = auction.seller_team_id === myTeamId;
              const isPlayerSale = !!auction.seller_team_id;
              return (
                <li
                  key={auction.id}
                  className={`p-4 rounded-xl shadow-sm border ${isOwnSale ? 'bg-orange-50 border-orange-200' : 'bg-white border-zinc-100'}`}
                >
                  <div className="flex justify-between mb-2">
                    <button
                      onClick={() => openPlayerHistory({
                        id: auction.player_id,
                        first_name: auction.player.first_name,
                        last_name: auction.player.last_name,
                        ranking: auction.player.ranking,
                        country: auction.player.country,
                        image_url: auction.player.image_url,
                      })}
                      className="flex items-center gap-2 text-left hover:opacity-80"
                    >
                      <img
                        src={auction.player.image_url || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/player-images/default.png`}
                        alt={`${auction.player.first_name} ${auction.player.last_name}`}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                      <span className="font-medium underline decoration-zinc-300">{auction.player.first_name} {auction.player.last_name}</span>
                      <span 
                        className={`text-lg ${probInfo.color}`} 
                        title={probInfo.label}
                      >
                        {probInfo.icon}
                      </span>
                      {isPlayerSale && auction.seller_team_image_url && (
                        <img
                          src={auction.seller_team_image_url}
                          alt="Manager"
                          className="w-7 h-7 rounded-full object-cover border border-zinc-300"
                        />
                      )}
                      {isOwnSale && (
                        <span className="text-xs px-2 py-1 rounded-md bg-orange-100 text-orange-700 font-medium">Dein Angebot</span>
                      )}
                    </button>
                    <div className="flex items-center gap-4">
                      <span className="text-zinc-500">Ranking: {auction.player.ranking}</span>
                      <span className="font-semibold text-emerald-600">Marktwert: {auction.market_value}€</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    {auction.my_bid ? (
                      <div className="flex items-center gap-2">
                        <span className="text-green-800 bg-green-100 px-2 py-1 rounded-md text-sm font-medium">Mein Gebot: {auction.my_bid.toLocaleString('de-DE')}€</span>
                        <button
                          onClick={() => withdrawBid(auction.id)}
                          className="text-xs px-2 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                        >
                          Zurückziehen
                        </button>
                      </div>
                    ) : isOwnSale ? (
                      <span className="text-zinc-500 text-sm">Dein Spieler - Du kannst nicht bieten</span>
                    ) : (
                      <span />
                    )}
                    <span className={`text-sm px-2 py-1 rounded-md ${remaining.urgent ? 'bg-red-100 text-red-700 font-semibold' : 'text-zinc-600 bg-zinc-100'}`}>
                      Restlaufzeit: {remaining.label}
                    </span>
                  </div>
                  {Number(auction.highest_bid || 0) > 0 && !auction.my_bid && (
                    <div className="mt-2 text-sm text-zinc-600">
                      Höchstgebot: <span className="font-semibold text-zinc-900">{Number(auction.highest_bid || 0).toLocaleString('de-DE')}€</span>
                    </div>
                  )}
                  {isOwnSale && !!auction.highest_bidder_id && Number(auction.highest_bid || 0) > 0 && (
                    <div className="mt-3">
                      <button
                        onClick={() => acceptHighestBid(auction.id)}
                        className="text-xs px-3 py-1.5 rounded-md border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      >
                        Hoechstes Gebot annehmen
                      </button>
                    </div>
                  )}
                  {isOwnSale && (
                    <div className="mt-3">
                      <button
                        onClick={() => cancelPlayerSale(auction.id)}
                        className="text-xs px-3 py-1.5 rounded-md border border-red-300 text-red-700 hover:bg-red-50"
                      >
                        Angebot stornieren
                      </button>
                    </div>
                  )}
                  {!isOwnSale && (
                    <div className="mt-3 flex items-center space-x-2">
                      <input
                        type="number"
                        id={`bid-${auction.id}`}
                        className="w-24 px-2 py-1 border rounded"
                        placeholder="Gebot"
                      />
                      <button
                        onClick={() => {
                          const bid = parseInt((document.getElementById(`bid-${auction.id}`) as HTMLInputElement).value);
                          placeBid(auction.id, bid);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded"
                      >
                        Bieten
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {activeTab === 'myteam' && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Mein Team</h2>
          <ul className="space-y-2">
            {myTeam.map(player => {
              const probInfo = getProbabilityIcon(player.appearance_probability);
              const marketValue = playerMarketValues.get(player.id) || 0;
              return (
                <li
                  key={player.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-white rounded-xl shadow-sm border border-zinc-100"
                >
                  <button
                    onClick={() => openPlayerHistory(player)}
                    className="flex items-center gap-2 text-left hover:opacity-80 min-w-0"
                  >
                    <img
                      src={player.image_url || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/player-images/default.png`}
                      alt={`${player.first_name} ${player.last_name}`}
                      className="w-10 h-10 rounded-full object-cover shrink-0"
                    />
                    <span className="underline decoration-zinc-300">{player.first_name} {player.last_name}</span>
                    <span 
                      className={`text-lg ${probInfo.color}`} 
                      title={probInfo.label}
                    >
                      {probInfo.icon}
                    </span>
                  </button>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-emerald-600 font-semibold">{playerTournamentPoints.get(player.id) || 0} Pkt</span>
                      <span className="text-zinc-500">#{player.ranking}</span>
                      <span className="text-emerald-600 font-semibold">{marketValue}€</span>
                    </div>
                    <button
                      onClick={() => {
                        setPlayerToSell(player);
                        setShowSaleModal(true);
                      }}
                      className="text-xs px-2 py-1 rounded-md border border-orange-200 text-orange-600 hover:bg-orange-50 whitespace-nowrap"
                    >
                      Verkaufen
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {activeTab === 'tournaments' && (
        <div className={isLineupEditMode ? 'pb-48 sm:pb-40' : ''}>
          {isLineupEditMode && (
            <button
              onClick={closeLineupEditMode}
              className="fixed top-6 left-6 z-[70] w-10 h-10 rounded-full border border-zinc-300 bg-white text-zinc-700 shadow-md hover:bg-zinc-50"
              title="Bearbeitungsmodus verlassen"
              aria-label="Bearbeitungsmodus verlassen"
            >
              ↩
            </button>
          )}

          {!isLineupEditMode && (
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Turniere &amp; Aufstellung</h2>
            </div>
          )}

          {!activeTournament ? (
            <div className="p-4 bg-white rounded-xl shadow-sm border border-zinc-100 text-zinc-500">
              Kein aktives Turnier gefunden.
            </div>
          ) : (
            <>
              {(() => {
                const lineupDeadline = getLineupDeadlineRemaining(activeTournament.start_date);
                return !isLineupEditMode ? (
              <div className="p-4 bg-white rounded-xl shadow-sm border border-zinc-100 mb-4">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Aktives Turnier: {activeTournament.name}</span>
                    {activeTournament.status === 'on-going' && (
                      <span className="inline-block text-xs px-2 py-1 rounded-md bg-red-100 text-red-700 font-semibold">
                        Läuft - Keine Änderungen möglich
                      </span>
                    )}
                    {activeTournament.status === 'completed' && (
                      <span className="inline-block text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-700">
                        Abgeschlossen
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="block text-zinc-500">Start: {new Date(activeTournament.start_date).toLocaleDateString('de-DE')}</span>
                    <span className={`inline-block mt-1 text-xs px-2 py-1 rounded-md ${lineupDeadline.urgent ? 'bg-orange-100 text-orange-700 font-semibold' : 'bg-sky-100 text-sky-700'}`}>
                      Restzeit Aufstellung: {lineupDeadline.label}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-zinc-500">Ziehe bis zu 5 Spieler in das Feld. Aufgestellte Spieler zaehlen direkt fuer deine Fantasy-Punkte.</p>
              </div>
                ) : null;
              })()}

              <div
                ref={courtContainerRef}
                className={`bg-sky-300 rounded-2xl p-4 sm:p-6 shadow-md mb-5 border border-sky-200 ${!isLineupEditMode ? 'cursor-pointer' : ''}`}
                onClick={() => {
                  if (!isLineupEditMode) {
                    setIsLineupEditMode(true);
                  }
                }}
              >
                {!isLineupEditMode && (
                  <div className="mb-3 text-sm font-medium text-sky-900 bg-white/80 border border-white rounded-lg px-3 py-2">
                    Tippe auf das Feld, um den Bearbeitungsmodus zu aktivieren.
                  </div>
                )}
                <div className={`relative rounded-xl h-[420px] sm:h-[480px] border-4 border-white overflow-hidden ${isLineupEditMode ? 'touch-none' : ''}`}>
                  <div className="absolute inset-x-0 top-1/2 border-t-4 border-white" />
                  <div className="absolute top-0 bottom-0 left-[14%] border-l-4 border-white" />
                  <div className="absolute top-0 bottom-0 right-[14%] border-r-4 border-white" />
                  <div className="absolute left-[14%] right-[14%] top-[30%] border-t-4 border-white" />
                  <div className="absolute left-[14%] right-[14%] bottom-[30%] border-b-4 border-white" />
                  <div className="absolute left-1/2 -translate-x-1/2 top-[30%] bottom-[30%] border-l-4 border-white" />
                  <div className="absolute left-[14%] right-[14%] top-1/2 h-1 bg-white" />

                  {[0, 1, 2, 3, 4].map((slotIndex) => {
                    const positions = [
                      'left-4 top-6 sm:left-10 sm:top-8',
                      'right-4 top-6 sm:right-10 sm:top-8',
                      'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
                      'left-4 bottom-6 sm:left-10 sm:bottom-8',
                      'right-4 bottom-6 sm:right-10 sm:bottom-8',
                    ];

                    const player = lineupSlots[slotIndex];
                    return (
                      <div
                        key={slotIndex}
                        className={`absolute ${positions[slotIndex]} w-28 sm:w-32`}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDropOnSlot(slotIndex)}
                        onClick={async (e) => {
                          e.stopPropagation();
                          await handleSlotTapForPlacement(slotIndex);
                        }}
                        data-lineup-slot-index={slotIndex}
                      >
                        <div className="rounded-xl border-2 border-dashed border-white/70 bg-white/90 min-h-20 p-2 text-center">
                          {player ? (
                            <div
                              draggable={isLineupEditMode}
                              onDragStart={() => handleDragStartFromSlot(slotIndex)}
                              onTouchStart={(e) => startTouchDragCandidate(player.id, slotIndex, e)}
                              onTouchMove={handleTouchMoveForDrag}
                              onTouchEnd={endTouchDrag}
                              onTouchCancel={handleTouchCancelDrag}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSlotPlayerTap(slotIndex);
                              }}
                              className={`cursor-grab active:cursor-grabbing ${selectedFromSlot === slotIndex ? 'ring-2 ring-emerald-400 rounded-lg' : ''}`}
                              title={`${player.first_name} ${player.last_name}`}
                            >
                              <img
                                src={player.image_url || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/player-images/default.png`}
                                alt={`${player.first_name} ${player.last_name}`}
                                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover mx-auto border border-zinc-200"
                              />
                              <p className="text-xs font-semibold mt-1">{player.first_name.charAt(0)}. {player.last_name}</p>
                              <p className="text-xs text-emerald-600 font-bold">{playerTournamentPoints.get(player.id) || 0} Pkt</p>
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-500">Slot {slotIndex + 1}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div
                className={`bg-white rounded-2xl border border-zinc-100 p-4 ${isLineupEditMode ? 'touch-none hidden' : ''}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  void handleDropOnBench();
                }}
                onClick={async () => {
                  await handleBenchTapForPlacement();
                }}
                data-lineup-bench
              >
                <h3 className="font-semibold mb-3">Nicht-Aufgestellt</h3>
                {notInLineupPlayers.length === 0 ? (
                  <p className="text-sm text-zinc-500">Alle verfuegbaren Spieler sind aktuell aufgestellt.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {notInLineupPlayers.map((player) => {
                      const probInfo = getProbabilityIcon(player.appearance_probability);
                      return (
                        <div
                          key={player.id}
                          draggable={isLineupEditMode}
                          onDragStart={() => handleDragStartFromBench(player.id)}
                          onTouchStart={(e) => startTouchDragCandidate(player.id, null, e)}
                          onTouchMove={handleTouchMoveForDrag}
                          onTouchEnd={endTouchDrag}
                          onTouchCancel={handleTouchCancelDrag}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBenchPlayerTap(player.id);
                          }}
                          className={`cursor-grab active:cursor-grabbing p-3 rounded-xl border hover:border-emerald-300 bg-zinc-50 ${selectedPlayerId === player.id && selectedFromSlot === null ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-zinc-200'}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <img
                                src={player.image_url || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/player-images/default.png`}
                                alt={`${player.first_name} ${player.last_name}`}
                                className="w-8 h-8 rounded-full object-cover"
                              />
                              <span className="font-medium text-zinc-900">{player.first_name} {player.last_name}</span>
                            </div>
                            <span className={`text-lg ${probInfo.color}`} title={probInfo.label}>{probInfo.icon}</span>
                          </div>
                          <p className="text-xs text-zinc-500 mt-1">#{player.ranking} - {player.country}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {isLineupEditMode && (
                <div
                  className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-200 bg-white/95 backdrop-blur p-3 sm:p-4 shadow-[0_-8px_24px_rgba(0,0,0,0.15)]"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    void handleDropOnBench();
                  }}
                  onClick={async () => {
                    await handleBenchTapForPlacement();
                  }}
                  data-lineup-bench
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm sm:text-base">Nicht-Aufgestellt</h3>
                    <span className="text-xs text-zinc-500">Immer sichtbar im Bearbeitungsmodus</span>
                  </div>

                  {notInLineupPlayers.length === 0 ? (
                    <p className="text-sm text-zinc-500">Alle verfuegbaren Spieler sind aktuell aufgestellt.</p>
                  ) : (
                    <div className="flex gap-2 overflow-x-auto pb-1 touch-pan-x">
                      {notInLineupPlayers.map((player) => {
                        const probInfo = getProbabilityIcon(player.appearance_probability);
                        return (
                          <div
                            key={`edit-tray-${player.id}`}
                            draggable={isLineupEditMode}
                            onDragStart={() => handleDragStartFromBench(player.id)}
                            onTouchStart={(e) => startTouchDragCandidate(player.id, null, e)}
                            onTouchMove={handleTouchMoveForDrag}
                            onTouchEnd={endTouchDrag}
                            onTouchCancel={handleTouchCancelDrag}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleBenchPlayerTap(player.id);
                            }}
                            className={`min-w-[180px] cursor-grab active:cursor-grabbing p-2.5 rounded-xl border hover:border-emerald-300 bg-zinc-50 ${selectedPlayerId === player.id && selectedFromSlot === null ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-zinc-200'}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <img
                                  src={player.image_url || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/player-images/default.png`}
                                  alt={`${player.first_name} ${player.last_name}`}
                                  className="w-8 h-8 rounded-full object-cover"
                                />
                                <span className="font-medium text-zinc-900 truncate text-sm">{player.first_name} {player.last_name}</span>
                              </div>
                              <span className={`text-base ${probInfo.color}`} title={probInfo.label}>{probInfo.icon}</span>
                            </div>
                            <p className="text-xs text-zinc-500 mt-1">#{player.ranking} - {player.country}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'news' && (
        <div>
          <h2 className="text-xl font-semibold mb-4">News</h2>
          {news.length === 0 ? (
            <div className="p-4 bg-white rounded-xl shadow-sm border border-zinc-100 text-zinc-500">Keine News vorhanden.</div>
          ) : (
            <ul className="space-y-3">
              {news.map((entry) => (
                <li key={entry.id} className="p-4 bg-white rounded-xl shadow-sm border border-zinc-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-zinc-900 flex items-center gap-2">
                      {entry.team_image_url && (
                        <img
                          src={entry.team_image_url}
                          alt="Manager"
                          className="w-6 h-6 rounded-full object-cover border border-zinc-300"
                        />
                      )}
                      {entry.title}
                      {isNewsEntryNew(entry.created_at) && (
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" aria-label="Neuer Eintrag" title="Neuer Eintrag" />
                      )}
                    </span>
                    <span className="text-xs text-zinc-500">{new Date(entry.created_at).toLocaleString('de-DE')}</span>
                  </div>
                  <p className="text-sm text-zinc-600">{entry.message}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {historyPlayer && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                Matchhistorie: {historyPlayer.first_name} {historyPlayer.last_name}
              </h3>
              <button
                onClick={() => setHistoryPlayer(null)}
                className="px-3 py-1 rounded-lg border border-zinc-300 hover:bg-zinc-50"
              >
                Schliessen
              </button>
            </div>

            {historyLoading ? (
              <p className="text-zinc-500">Lade Matchhistorie...</p>
            ) : historyMatches.length === 0 ? (
              <p className="text-zinc-500">Keine Matches vorhanden.</p>
            ) : (
              <div className="space-y-3">
                {historyMatches.map((match) => (
                  <div key={match.id} className="p-4 border border-zinc-200 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-zinc-900">{match.tournament_name}</span>
                      <span className="text-xs text-zinc-500">{new Date(match.match_date).toLocaleDateString('de-DE')}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-zinc-500">Gegner:</span> {match.opponent_name}</div>
                      <div>
                        <span className="text-zinc-500">Ergebnis:</span>{' '}
                        <span className={match.match_result === 'won' ? 'text-green-600 font-medium' : 'text-red-600'}>
                          {match.match_result === 'won' ? 'Sieg' : 'Niederlage'}
                        </span>
                      </div>
                      <div><span className="text-zinc-500">Asse:</span> {match.aces}</div>
                      <div><span className="text-zinc-500">Doppelfehler:</span> {match.double_faults}</div>
                      <div><span className="text-zinc-500">Break Points:</span> {match.break_points_won}</div>
                      <div><span className="text-zinc-500">Net-Points Won:</span> {match.net_points_won || 0}</div>
                      <div><span className="text-zinc-500">Break kassiert:</span> {match.breaks_conceded || 0}</div>
                      <div><span className="text-zinc-500">Winners:</span> {match.winners}</div>
                      <div><span className="text-zinc-500">Unforced Errors:</span> {match.unforced_errors}</div>
                      <div><span className="text-zinc-500">Fantasy Punkte:</span> <span className="font-semibold text-emerald-600">{match.fantasy_points}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {teamInspection && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto p-5">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="text-lg font-semibold text-zinc-900">{teamInspection.team.name}</h3>
                <p className="text-sm text-zinc-500">
                  {teamInspection.team.total_points_scored} Punkte
                  {activeTournament ? ` · Aufstellung fuer ${activeTournament.name}` : ''}
                </p>
              </div>
              <button
                onClick={closeTeamInspection}
                className="px-3 py-1 rounded-lg border border-zinc-300 hover:bg-zinc-50"
              >
                Schliessen
              </button>
            </div>

            {teamInspectionLoading ? (
              <p className="text-zinc-500">Teamdetails werden geladen...</p>
            ) : (
              <div className="space-y-6">
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-zinc-900">Aktuelle Aufstellung</h4>
                    {activeTournament && (
                      <span className="text-xs px-2 py-1 rounded-md bg-sky-100 text-sky-700">
                        {activeTournament.name}
                      </span>
                    )}
                  </div>

                  {!activeTournament ? (
                    <p className="text-sm text-zinc-500">Derzeit gibt es kein aktives Turnier.</p>
                  ) : teamInspection.lineup.length === 0 ? (
                    <p className="text-sm text-zinc-500">Dieses Team hat aktuell keine Aufstellung hinterlegt.</p>
                  ) : (
                    <div className="bg-sky-300 rounded-2xl p-4 sm:p-6 shadow-md border border-sky-200">
                      <div className="relative rounded-xl h-[360px] sm:h-[420px] border-4 border-white overflow-hidden">
                        <div className="absolute inset-x-0 top-1/2 border-t-4 border-white" />
                        <div className="absolute top-0 bottom-0 left-[14%] border-l-4 border-white" />
                        <div className="absolute top-0 bottom-0 right-[14%] border-r-4 border-white" />
                        <div className="absolute left-[14%] right-[14%] top-[30%] border-t-4 border-white" />
                        <div className="absolute left-[14%] right-[14%] bottom-[30%] border-b-4 border-white" />
                        <div className="absolute left-1/2 -translate-x-1/2 top-[30%] bottom-[30%] border-l-4 border-white" />
                        <div className="absolute left-[14%] right-[14%] top-1/2 h-1 bg-white" />

                        {[0, 1, 2, 3, 4].map((slotIndex) => {
                          const player = teamInspection.lineup[slotIndex] || null;

                          return (
                            <div
                              key={slotIndex}
                              className={`absolute ${inspectionLineupPositions[slotIndex]} w-28 sm:w-32`}
                            >
                              <div className="rounded-xl border-2 border-dashed border-white/70 bg-white/90 min-h-24 p-2 text-center">
                                {player ? (
                                  <button
                                    onClick={() => openPlayerHistory(player)}
                                    className="w-full text-center hover:opacity-85"
                                    title={`${player.first_name} ${player.last_name}`}
                                  >
                                    <img
                                      src={player.image_url || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/player-images/default.png`}
                                      alt={`${player.first_name} ${player.last_name}`}
                                      className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover mx-auto border border-zinc-200"
                                    />
                                    <p className="text-xs font-semibold mt-1">{player.first_name.charAt(0)}. {player.last_name}</p>
                                    <p className="text-xs text-zinc-500">#{player.ranking}</p>
                                    <p className="text-xs text-emerald-600 font-bold">{playerTournamentPoints.get(player.id) || 0} Pkt</p>
                                  </button>
                                ) : (
                                  <p className="text-xs text-zinc-500 pt-7">Freier Slot</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </section>

                <section>
                  <h4 className="font-semibold text-zinc-900 mb-3">Kader</h4>
                  {teamInspection.squad.length === 0 ? (
                    <p className="text-sm text-zinc-500">Dieses Team hat derzeit keine Spieler im Kader.</p>
                  ) : (
                    <ul className="space-y-2">
                      {teamInspection.squad.map((player) => {
                        const probInfo = getProbabilityIcon(player.appearance_probability);
                        const isInLineup = teamInspection.lineup.some((lineupPlayer) => lineupPlayer.id === player.id);
                        return (
                          <li key={player.id}>
                            <button
                              onClick={() => openPlayerHistory(player)}
                              className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-zinc-100 bg-white text-left hover:border-zinc-300"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <img
                                  src={player.image_url || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/player-images/default.png`}
                                  alt={`${player.first_name} ${player.last_name}`}
                                  className="w-10 h-10 rounded-full object-cover"
                                />
                                <div className="min-w-0">
                                  <span className="block font-medium text-zinc-900 truncate">
                                    {player.first_name} {player.last_name}
                                  </span>
                                  <span className="text-xs text-zinc-500">#{player.ranking} - {player.country}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                {isInLineup && (
                                  <span className="text-xs px-2 py-1 rounded-md bg-emerald-100 text-emerald-700 font-medium">
                                    Aufgestellt
                                  </span>
                                )}
                                <span className={`text-lg ${probInfo.color}`} title={probInfo.label}>{probInfo.icon}</span>
                                <span className="text-sm font-semibold text-emerald-600">
                                  {playerTournamentPoints.get(player.id) || 0} Pkt
                                </span>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      )}

      {playerToSell && showSaleModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                {playerToSell.first_name} {playerToSell.last_name} verkaufen
              </h3>
              <button
                onClick={() => {
                  setPlayerToSell(null);
                  setShowSaleModal(false);
                }}
                className="px-3 py-1 rounded-lg border border-zinc-300 hover:bg-zinc-50"
              >
                Schliessen
              </button>
            </div>

            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-800">
                <span className="font-semibold">Marktwert:</span> {playerMarketValues.get(playerToSell.id) || 0}€
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => sellPlayerToMarket(playerToSell)}
                disabled={sellLoading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white px-4 py-3 rounded-lg font-medium transition"
              >
                {sellLoading ? 'Wird verkauft...' : 'Direkt für Marktwert verkaufen'}
              </button>
              <button
                onClick={() => offerPlayerForSale(playerToSell)}
                disabled={sellLoading}
                className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white px-4 py-3 rounded-lg font-medium transition"
              >
                {sellLoading ? 'Wird angeboten...' : 'Auf Transfermarkt anbieten'}
              </button>
              <button
                onClick={() => {
                  setPlayerToSell(null);
                  setShowSaleModal(false);
                }}
                disabled={sellLoading}
                className="w-full bg-zinc-200 hover:bg-zinc-300 disabled:bg-gray-400 text-zinc-900 px-4 py-3 rounded-lg font-medium transition"
              >
                Abbrechen
              </button>
            </div>

            <p className="text-xs text-zinc-500 mt-4 text-center">
              Bei "Direkt verkaufen" erhältst Du sofort den Marktwert und der Spieler wird vom Markt aufgenommen.
              <br />
              Bei "Anbieten" können andere Manager Gebote abgeben, Du kannst aber auch jederzeit zum Marktwert verkaufen.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}