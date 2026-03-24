'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowUpRight, Bot, ChevronDown, Clock3, Coins, Plus, Send, Star, X } from 'lucide-react';
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
  seller_team_name?: string | null;
  highest_bidder_id?: string | null;
  highest_bid?: number;
  player: { first_name: string; last_name: string; ranking: number; country: string; image_url?: string };
  appearance_probability?: string;
  is_wildcard?: boolean;
  market_value?: number;
  my_bid?: number;
  highest_bidder_team_name?: string | null;
  incoming_bids?: { team_id: string; team_name: string; bid_amount: number; created_at: string }[];
  seller_team_image_url?: string | null;
  tournament_id?: string | null;
  tournament_name?: string | null;
  tournament_country_code?: string | null;
  seeding_status?: string | null;
  tournament_seed_position?: number | null;
}

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  ranking: number;
  country: string;
  image_url?: string;
  appearance_probability?: string;
  is_wildcard?: boolean;
}

interface PlayerMatch {
  id: string;
  tournament_name: string;
  opponent_name: string;
  match_result: string;
  round?: 'R1' | 'R2' | 'R3' | 'QF' | 'SF' | 'F' | null;
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
  is_active?: boolean;
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
  lineupSlots: LineupSlot[];
  reserveSlots: LineupSlot[];
}

interface PlayerRoundState {
  label: string;
  inTournament: boolean;
}

type LineupSlot = Player | null;

const MAIN_LINEUP_SLOT_COUNT = 5;
const RESERVE_LINEUP_SLOT_COUNT = 2;
const TOTAL_LINEUP_SLOT_COUNT = MAIN_LINEUP_SLOT_COUNT + RESERVE_LINEUP_SLOT_COUNT;
const RESERVE_SLOT_START_INDEX = MAIN_LINEUP_SLOT_COUNT;
const RESERVE_ELIGIBLE_RANKING_THRESHOLD = 75;

const createEmptyLineupSlots = (count: number): LineupSlot[] => Array.from({ length: count }, () => null);

const countryAlpha3ToAlpha2: Record<string, string> = {
  ARG: 'AR',
  AUS: 'AU',
  AUT: 'AT',
  BEL: 'BE',
  BRA: 'BR',
  CAN: 'CA',
  CHI: 'CL',
  CHN: 'CN',
  COL: 'CO',
  CZE: 'CZ',
  DEN: 'DK',
  ESP: 'ES',
  FRA: 'FR',
  GBR: 'GB',
  GER: 'DE',
  GRE: 'GR',
  HUN: 'HU',
  IND: 'IN',
  ITA: 'IT',
  JPN: 'JP',
  KAZ: 'KZ',
  NED: 'NL',
  NOR: 'NO',
  POL: 'PL',
  POR: 'PT',
  ROU: 'RO',
  RSA: 'ZA',
  SRB: 'RS',
  SUI: 'CH',
  SWE: 'SE',
  TUR: 'TR',
  UKR: 'UA',
  USA: 'US',
};

const countryAliasToAlpha2: Record<string, string> = {
  ARGENTINA: 'AR',
  ARGENTINIEN: 'AR',
  AUSTRALIA: 'AU',
  AUSTRIA: 'AT',
  BELGIUM: 'BE',
  BRAZIL: 'BR',
  BRASIL: 'BR',
  CANADA: 'CA',
  CHILE: 'CL',
  CHINA: 'CN',
  COLOMBIA: 'CO',
  CZECHREPUBLIC: 'CZ',
  CZECHIA: 'CZ',
  DEUTSCHLAND: 'DE',
  DENMARK: 'DK',
  FRANCE: 'FR',
  GERMANY: 'DE',
  GREATBRITAIN: 'GB',
  GREECE: 'GR',
  HUNGARY: 'HU',
  INDIA: 'IN',
  ITALY: 'IT',
  JAPAN: 'JP',
  KAZAKHSTAN: 'KZ',
  NETHERLANDS: 'NL',
  NORWAY: 'NO',
  POLAND: 'PL',
  PORTUGAL: 'PT',
  ROMANIA: 'RO',
  SERBIA: 'RS',
  SOUTHAFRICA: 'ZA',
  SPAIN: 'ES',
  SWEDEN: 'SE',
  SWITZERLAND: 'CH',
  TUERKEI: 'TR',
  TURKEY: 'TR',
  UK: 'GB',
  UKRAINE: 'UA',
  UNITEDKINGDOM: 'GB',
  UNITEDSTATES: 'US',
  USA: 'US',
};

const normalizeCountryKey = (country?: string | null) => {
  if (!country) return '';
  return country
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase();
};

const countryCodeToFlag = (countryCode?: string | null) => {
  if (!countryCode) return '';

  const raw = countryCode.trim().toUpperCase();
  const normalized = normalizeCountryKey(countryCode);

  let alpha2 = '';
  if (/^[A-Z]{2}$/.test(raw)) {
    alpha2 = raw;
  } else if (/^[A-Z]{3}$/.test(raw)) {
    alpha2 = countryAlpha3ToAlpha2[raw] || '';
  } else {
    alpha2 = countryAliasToAlpha2[normalized] || '';
  }

  if (!alpha2 || !/^[A-Z]{2}$/.test(alpha2)) return '';

  return alpha2
    .toUpperCase()
    .split('')
    .map((char) => String.fromCodePoint(char.charCodeAt(0) + 127397))
    .join('');
};

const tournamentAccentClasses = [
  'bg-sky-500',
  'bg-rose-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-cyan-500',
  'bg-fuchsia-500',
];

const getFallbackTournamentAccentClass = (tournamentId?: string | null) => {
  if (!tournamentId) return 'bg-zinc-400';

  let hash = 0;
  for (let i = 0; i < tournamentId.length; i += 1) {
    hash = (hash * 31 + tournamentId.charCodeAt(i)) >>> 0;
  }

  return tournamentAccentClasses[hash % tournamentAccentClasses.length];
};

const getSeedingBadgeClass = (seedingStatus?: string | null) => {
  if (!seedingStatus) return 'bg-zinc-700 text-zinc-50 border border-zinc-600';
  if (seedingStatus === 'Top-Seed') return 'bg-violet-900/90 text-violet-50 border border-violet-700';
  if (seedingStatus === 'Gesetzt') return 'bg-slate-700 text-slate-50 border border-slate-500';
  if (seedingStatus === 'Main-Draw') return 'bg-teal-700 text-teal-50 border border-teal-500';
  if (seedingStatus.startsWith('Qualifikation')) return 'bg-zinc-200 text-zinc-700 border border-zinc-300';
  return 'bg-zinc-700 text-zinc-50 border border-zinc-600';
};

const hasPrioritySeedingStar = (seedingStatus?: string | null) => {
  return seedingStatus === 'Top-Seed' || seedingStatus === 'Gesetzt' || seedingStatus === 'Main-Draw';
};

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
  const [lineupSlots, setLineupSlots] = useState<LineupSlot[]>(() => createEmptyLineupSlots(TOTAL_LINEUP_SLOT_COUNT));
  const [draggedPlayerId, setDraggedPlayerId] = useState<string | null>(null);
  const [draggedFromSlot, setDraggedFromSlot] = useState<number | null>(null);
  const [historyPlayer, setHistoryPlayer] = useState<Player | null>(null);
  const [historyMatches, setHistoryMatches] = useState<PlayerMatch[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [news, setNews] = useState<LeagueNews[]>([]);
  const [lastSeenNewsAt, setLastSeenNewsAt] = useState<string | null>(null);
  const [timeTick, setTimeTick] = useState(0);
  const [playerTournamentPoints, setPlayerTournamentPoints] = useState<Map<string, number>>(new Map());
  const [playerRoundStates, setPlayerRoundStates] = useState<Map<string, PlayerRoundState>>(new Map());
  const [myBudget, setMyBudget] = useState<number | null>(null);
  const [teamInspection, setTeamInspection] = useState<TeamInspection | null>(null);
  const [teamInspectionLoading, setTeamInspectionLoading] = useState(false);
  const [playerToSell, setPlayerToSell] = useState<Player | null>(null);
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [sellLoading, setSellLoading] = useState(false);
  const [marketTournamentFilterId, setMarketTournamentFilterId] = useState<string>('all');
  const [playerMarketValues, setPlayerMarketValues] = useState<Map<string, number>>(new Map());
  const [isLineupEditMode, setIsLineupEditMode] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedFromSlot, setSelectedFromSlot] = useState<number | null>(null);
  const [isTouchDragActive, setIsTouchDragActive] = useState(false);
  const [activeBidAuction, setActiveBidAuction] = useState<Auction | null>(null);
  const [bidDraftAmount, setBidDraftAmount] = useState<string>('');
  const [slotSelectionSheet, setSlotSelectionSheet] = useState<{ slotIndex: number } | null>(null);
  const [lineupHasChanges, setLineupHasChanges] = useState(false);
  const [collapsedAuctionGroups, setCollapsedAuctionGroups] = useState<Set<string>>(new Set());
  const lineupEditorScrollRef = useRef<HTMLDivElement | null>(null);
  const courtContainerRef = useRef<HTMLDivElement | null>(null);
  const touchDragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const myLeaderboardRowRef = useRef<HTMLLIElement | null>(null);
  const [isMyLeaderboardRowVisible, setIsMyLeaderboardRowVisible] = useState(true);

  const tournamentAccentClassById = useMemo(() => {
    const map = new Map<string, string>();
    const orderedTournaments = [...tournaments].sort(
      (left, right) => new Date(left.start_date).getTime() - new Date(right.start_date).getTime()
    );

    orderedTournaments.forEach((tournament, index) => {
      map.set(tournament.id, tournamentAccentClasses[index % tournamentAccentClasses.length]);
    });

    return map;
  }, [tournaments]);

  const formatCurrency = (value: number) => `${value.toLocaleString('de-DE')}€`;
  const sportyNumberClass = 'font-mono tabular-nums tracking-tight';

  const getTournamentAccentClassByMeta = (tournamentName?: string | null, tournamentId?: string | null) => {
    const normalizedName = (tournamentName || '').toLowerCase();
    if (normalizedName.includes('bukarest')) return 'bg-sky-500';
    if (normalizedName.includes('marrakesch')) return 'bg-rose-500';

    return tournamentId
      ? (tournamentAccentClassById.get(tournamentId) || getFallbackTournamentAccentClass(tournamentId))
      : getFallbackTournamentAccentClass(null);
  };

  const getTournamentAccentClass = (auction: Auction) => {
    return getTournamentAccentClassByMeta(auction.tournament_name, auction.tournament_id);
  };

  const myTeamTotalPoints = useMemo(
    () => myTeam.reduce((sum, player) => sum + (playerTournamentPoints.get(player.id) || 0), 0),
    [myTeam, playerTournamentPoints]
  );

  const myTeamTotalMarketValue = useMemo(
    () => myTeam.reduce((sum, player) => sum + (playerMarketValues.get(player.id) || 0), 0),
    [myTeam, playerMarketValues]
  );

  const myTeamPlaceholderCount = Math.max(TOTAL_LINEUP_SLOT_COUNT - myTeam.length, 0);

  const getAuctionDisplayFirstName = (auction: Auction) => auction.player.last_name;

  const getAuctionDisplayLastName = (auction: Auction) => auction.player.first_name;

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

  const formatLineupPlayerName = (player: Pick<Player, 'first_name'>) => player.first_name;
  const isReserveSlot = (slotIndex: number) => slotIndex >= RESERVE_SLOT_START_INDEX;
  const isReserveEligiblePlayer = (player: Player | null) => !player || player.ranking > RESERVE_ELIGIBLE_RANKING_THRESHOLD;
  const getReserveValidationError = (slots: LineupSlot[]) => {
    for (let slotIndex = RESERVE_SLOT_START_INDEX; slotIndex < slots.length; slotIndex += 1) {
      const player = slots[slotIndex];
      if (!isReserveEligiblePlayer(player)) {
        return `${player?.first_name} ${player?.last_name} darf nur ins Zusatzfeld, wenn das Ranking schlechter als ${RESERVE_ELIGIBLE_RANKING_THRESHOLD} ist.`;
      }
    }
    return null;
  };
  const getDisplayedLineupPoints = (player: Player, slotIndex: number) => {
    const points = playerTournamentPoints.get(player.id) || 0;
    return isReserveSlot(slotIndex) ? Math.max(0, points) : points;
  };
  const getPointsTextClass = (points: number) => (points < 0 ? 'text-red-600' : 'text-emerald-600');

  const isPlayerValidForSlot = (player: Player | null, slotIndex: number): boolean => {
    if (!player) return true;
    if (isReserveSlot(slotIndex)) {
      return player.ranking > RESERVE_ELIGIBLE_RANKING_THRESHOLD;
    }
    return true;
  };

  const getSlotValidationClass = (player: Player | null, slotIndex: number): string => {
    if (isReserveSlot(slotIndex) && player && !isPlayerValidForSlot(player, slotIndex)) {
      return 'ring-2 ring-red-500 ring-offset-2';
    }
    return '';
  };

  const getValidPlayersForSlot = (slotIndex: number): Player[] => {
    if (isReserveSlot(slotIndex)) {
      return notInLineupPlayers.filter((p) => isPlayerValidForSlot(p, slotIndex));
    }
    return notInLineupPlayers;
  };

  const applyPlayerToSlot = async (slotIndex: number, player: Player) => {
    if (!isPlayerValidForSlot(player, slotIndex)) {
      alert(`${player.first_name} erfüllt die Bedingungen für Reserve-Slot nicht (Ranking muss größer als ${RESERVE_ELIGIBLE_RANKING_THRESHOLD} sein).`);
      return;
    }
    const nextSlots = [...lineupSlots];
    nextSlots[slotIndex] = player;
    setLineupHasChanges(true);
    await applyLineupUpdate(nextSlots);
    setSlotSelectionSheet(null);
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
      loadLeaderboard();
      loadTournaments();
    }
  }, [user, leagueId]);

  useEffect(() => {
    if (user && activeTournamentId) {
      loadAuctions();
      loadPlayerTournamentPoints();
      if (myTeamId) {
        (async () => {
          const teamPlayers = await loadMyTeam();
          await loadCurrentLineup(new Set(teamPlayers.map((player) => player.id)));
        })();
        loadNews();
      }
    }
  }, [user, leagueId, myTeamId, activeTournamentId]);

  useEffect(() => {
    if (!user) return;
    if (activeTab !== 'auctions') return;
    void loadAuctions();
  }, [marketTournamentFilterId, activeTab, user]);

  useEffect(() => {
    const selectedTournament = tournaments.find((t) => t.id === activeTournamentId) || null;
    setActiveTournament(selectedTournament);
  }, [tournaments, activeTournamentId]);

  useEffect(() => {
    if (marketTournamentFilterId === 'all') return;
    const exists = tournaments.some((tournament) => tournament.id === marketTournamentFilterId);
    if (!exists) {
      setMarketTournamentFilterId('all');
    }
  }, [tournaments, marketTournamentFilterId]);

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
    if (!activeBidAuction) return;

    const scrollY = window.scrollY;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyOverscrollBehavior = document.body.style.overscrollBehavior;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyLeft = document.body.style.left;
    const previousBodyRight = document.body.style.right;
    const previousBodyWidth = document.body.style.width;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousHtmlOverscrollBehavior = document.documentElement.style.overscrollBehavior;

    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';

    return () => {
      const lockedTop = document.body.style.top;

      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.left = previousBodyLeft;
      document.body.style.right = previousBodyRight;
      document.body.style.width = previousBodyWidth;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscrollBehavior;

      const restoredScrollY = lockedTop ? Math.abs(parseInt(lockedTop, 10)) : scrollY;
      window.scrollTo(0, Number.isFinite(restoredScrollY) ? restoredScrollY : scrollY);
    };
  }, [activeBidAuction]);

  useEffect(() => {
    if (!isLineupEditMode) return;

    lineupEditorScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    courtContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  useEffect(() => {
    if (activeTournament?.status !== 'on-going' || !isLineupEditMode) return;

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
  }, [activeTournament?.status, isLineupEditMode]);

  useEffect(() => {
    const el = myLeaderboardRowRef.current;
    if (!el || activeTab !== 'leaderboard') return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsMyLeaderboardRowVisible(entry.isIntersecting),
      { threshold: 0.5, rootMargin: '0px 0px -60px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeTab, leaderboard]);

  const loadLeaderboard = async () => {
    const { data } = await supabase
      .from('fantasy_teams')
      .select('id, name, total_points_scored, user_id, profile_image_url')
      .eq('league_id', leagueId)
      .order('total_points_scored', { ascending: false });
    setLeaderboard(data || []);
  };

  const loadCurrentLineup = async (allowedPlayerIds?: Set<string>) => {
    if (!myTeamId || !activeTournamentId) return;

    const { data } = await supabase
      .from('tournament_lineups')
      .select('slot_index, player:players(id, first_name, last_name, ranking, country, image_url)')
      .eq('tournament_id', activeTournamentId)
      .eq('team_id', myTeamId)
      .order('slot_index', { ascending: true });

    const nextSlots = createEmptyLineupSlots(TOTAL_LINEUP_SLOT_COUNT);
    for (const entry of data || []) {
      const player = Array.isArray((entry as any).player) ? (entry as any).player[0] : (entry as any).player;
      const slotIndex = Number((entry as any).slot_index);
      if (!player || !Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= TOTAL_LINEUP_SLOT_COUNT) {
        continue;
      }
      if (allowedPlayerIds && !allowedPlayerIds.has(player.id)) {
        continue;
      }
      nextSlots[slotIndex] = player;
    }

    setLineupSlots(nextSlots);
  };

  const loadPlayerTournamentPoints = async () => {
    if (!activeTournamentId) return;

    let matches: any[] = [];

    const { data: detailedMatches, error: detailedMatchesError } = await supabase
      .from('player_matches')
      .select('player_id, fantasy_points, match_result, round, match_date')
      .eq('tournament_id', activeTournamentId);

    if (detailedMatchesError) {
      console.error('Failed to load detailed match data, falling back to points-only query:', detailedMatchesError);
      const { data: fallbackMatches, error: fallbackError } = await supabase
        .from('player_matches')
        .select('player_id, fantasy_points, match_result, match_date')
        .eq('tournament_id', activeTournamentId);

      if (fallbackError) {
        console.error('Failed to load match data:', fallbackError);
        return;
      }

      matches = fallbackMatches || [];
    } else {
      matches = detailedMatches || [];
    }

    const pointsMap = new Map<string, number>();
    const latestMatchByPlayer = new Map<string, any>();
    for (const match of matches) {
      const currentPoints = pointsMap.get(match.player_id) || 0;
      pointsMap.set(match.player_id, currentPoints + (match.fantasy_points || 0));

      const existingLatest = latestMatchByPlayer.get(match.player_id);
      const currentDate = new Date(match.match_date).getTime();
      const existingDate = existingLatest ? new Date(existingLatest.match_date).getTime() : -Infinity;
      if (!existingLatest || currentDate >= existingDate) {
        latestMatchByPlayer.set(match.player_id, match);
      }
    }

    const nextRoundMap: Record<string, string> = {
      R1: 'R2',
      R2: 'R3',
      R3: 'QF',
      QF: 'SF',
      SF: 'F',
      F: 'SIEGER',
    };

    const roundStateMap = new Map<string, PlayerRoundState>();
    for (const [playerId, latestMatch] of latestMatchByPlayer.entries()) {
      const matchResult = latestMatch.match_result as string | undefined;
      const playedRound = latestMatch.round as string | undefined;

      if (matchResult === 'lost') {
        roundStateMap.set(playerId, { label: 'OUT', inTournament: false });
        continue;
      }

      if (matchResult === 'won') {
        const nextRound = playedRound ? (nextRoundMap[playedRound] || 'R1/R2') : 'R1/R2';
        const stillInTournament = playedRound !== 'F';
        roundStateMap.set(playerId, { label: nextRound, inTournament: stillInTournament });
        continue;
      }

      roundStateMap.set(playerId, { label: 'R1/R2', inTournament: true });
    }

    setPlayerTournamentPoints(pointsMap);
    setPlayerRoundStates(roundStateMap);
  };

const loadAuctions = async () => {
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
    // Get appearance probabilities and market values only for upcoming tournaments.
    const playerIds = data.map((auction: any) => auction.player_id);
    const selectedTournamentFilter = marketTournamentFilterId === 'all' ? null : marketTournamentFilterId;
    const upcomingTournaments = tournaments.filter((tournament) => tournament.status === 'upcoming');
    const upcomingTournamentIds = upcomingTournaments.map((tournament) => tournament.id);

    if (!selectedTournamentFilter && upcomingTournamentIds.length === 0) {
      setAuctions([]);
      return;
    }

    let probabilitiesQuery = supabase
      .from('tournament_players')
      .select('player_id, appearance_probability, market_value, is_wildcard, tournament_id, seeding_status, tournament_seed_position, tournament:tournaments(id, name, country_code, status, start_date)')
      .in('player_id', playerIds);

    if (selectedTournamentFilter) {
      probabilitiesQuery = probabilitiesQuery.eq('tournament_id', selectedTournamentFilter);
    } else if (upcomingTournamentIds.length > 0) {
      probabilitiesQuery = probabilitiesQuery.in('tournament_id', upcomingTournamentIds);
    }

    const { data: probabilities } = await probabilitiesQuery;

    const eligibleProbabilities = (probabilities || []).filter((entry: any) => {
      const tournament = Array.isArray(entry.tournament) ? entry.tournament[0] : entry.tournament;
      return tournament?.status === 'upcoming';
    });

    const probabilityPriority = (probability?: string) => {
      switch (probability) {
        case 'Garantiert':
          return 6;
        case 'Sehr Wahrscheinlich':
          return 5;
        case 'Wahrscheinlich':
          return 4;
        case 'Riskant':
          return 3;
        case 'Sehr Riskant':
          return 2;
        case 'Ausgeschlossen':
          return 1;
        default:
          return 0;
      }
    };

    const seedingPriority = (seedingStatus?: string | null) => {
      switch (seedingStatus) {
        case 'Top-Seed':
          return 6;
        case 'Gesetzt':
          return 5;
        case 'Main-Draw':
          return 4;
        case 'Qualifikation - R1':
          return 3;
        case 'Qualifikation - R2':
          return 2;
        default:
          return 0;
      }
    };

    const probabilityMap = new Map<string, {
      appearance_probability?: string;
      market_value?: number;
      is_wildcard?: boolean;
      tournament_id?: string;
      tournament_name?: string;
      tournament_country_code?: string;
      seeding_status?: string;
      tournament_seed_position?: number | null;
      tournament_start_date?: string;
    }>();

    for (const probability of eligibleProbabilities) {
      const tournament = Array.isArray(probability.tournament) ? probability.tournament[0] : probability.tournament;
      const existing = probabilityMap.get(probability.player_id);
      const currentPriority = probabilityPriority(probability.appearance_probability);
      const existingPriority = probabilityPriority(existing?.appearance_probability);
      const currentSeedingPriority = seedingPriority(probability.seeding_status);
      const existingSeedingPriority = seedingPriority(existing?.seeding_status);
      const currentStartDate = new Date(tournament?.start_date || 0).getTime();
      const existingStartDate = new Date(existing?.tournament_start_date || 0).getTime();

      const shouldReplace =
        !existing
        || currentPriority > existingPriority
        || (currentPriority === existingPriority && currentSeedingPriority > existingSeedingPriority)
        || (currentPriority === existingPriority && currentSeedingPriority === existingSeedingPriority && currentStartDate < existingStartDate);

      if (shouldReplace) {
        probabilityMap.set(probability.player_id, {
          appearance_probability: probability.appearance_probability,
          market_value: probability.market_value,
          is_wildcard: Boolean(probability.is_wildcard),
          tournament_id: probability.tournament_id,
          tournament_name: tournament?.name || null,
          tournament_country_code: tournament?.country_code || null,
          seeding_status: probability.seeding_status,
          tournament_seed_position: probability.tournament_seed_position ?? null,
          tournament_start_date: tournament?.start_date || null,
        });
      }
    }

    const allowedPlayerIds = selectedTournamentFilter
      ? new Set(eligibleProbabilities.map((entry: any) => entry.player_id as string))
      : new Set(eligibleProbabilities.map((entry: any) => entry.player_id as string));

    const formattedData = data.map((auction: any) => ({
      ...auction,
      player: Array.isArray(auction.player) ? auction.player[0] : auction.player,
      appearance_probability: probabilityMap.get(auction.player_id)?.appearance_probability,
      is_wildcard: probabilityMap.get(auction.player_id)?.is_wildcard,
      market_value: probabilityMap.get(auction.player_id)?.market_value || 0,
      tournament_id: probabilityMap.get(auction.player_id)?.tournament_id || null,
      tournament_name: probabilityMap.get(auction.player_id)?.tournament_name || null,
      tournament_country_code: probabilityMap.get(auction.player_id)?.tournament_country_code || null,
      seeding_status: probabilityMap.get(auction.player_id)?.seeding_status || null,
      tournament_seed_position: probabilityMap.get(auction.player_id)?.tournament_seed_position ?? null,
    }))
      .filter((auction: any) => {
        return allowedPlayerIds.has(auction.player_id);
      });

    const sellerTeamIds = Array.from(
      new Set(
        formattedData
          .map((auction: any) => auction.seller_team_id)
          .filter((teamId: string | null | undefined): teamId is string => Boolean(teamId))
      )
    );

    let sellerTeamImageMap = new Map<string, string | null>();
    let sellerTeamNameMap = new Map<string, string>();
    if (sellerTeamIds.length > 0) {
      const { data: sellerTeams } = await supabase
        .from('fantasy_teams')
        .select('id, name, profile_image_url')
        .in('id', sellerTeamIds);

      sellerTeamImageMap = new Map(
        (sellerTeams || []).map((team: any) => [team.id, team.profile_image_url || null])
      );
      sellerTeamNameMap = new Map(
        (sellerTeams || []).map((team: any) => [team.id, team.name])
      );
    }

    const highestBidderTeamIds = Array.from(
      new Set(
        formattedData
          .map((auction: any) => auction.highest_bidder_id)
          .filter((teamId: string | null | undefined): teamId is string => Boolean(teamId))
      )
    );

    let bidderTeamNameMap = new Map<string, string>();
    if (highestBidderTeamIds.length > 0) {
      const { data: bidderTeams } = await supabase
        .from('fantasy_teams')
        .select('id, name')
        .in('id', highestBidderTeamIds);

      bidderTeamNameMap = new Map(
        (bidderTeams || []).map((team: any) => [team.id, team.name])
      );
    }

    const ownAuctionIds = formattedData
      .filter((auction: any) => auction.seller_team_id && auction.seller_team_id === myTeamId)
      .map((auction: any) => auction.id as string);

    let incomingBidsByAuction = new Map<string, { team_id: string; team_name: string; bid_amount: number; created_at: string }[]>();
    if (ownAuctionIds.length > 0) {
      const bidsResponse = await fetch('/api/league/player-sales/bids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leagueId, auctionIds: ownAuctionIds }),
      });

      const bidsPayload = await bidsResponse.json();
      if (bidsResponse.ok && bidsPayload?.bidsByAuction) {
        for (const [auctionId, bids] of Object.entries(bidsPayload.bidsByAuction as Record<string, any[]>)) {
          incomingBidsByAuction.set(
            auctionId,
            (bids || []).map((bid: any) => ({
              team_id: bid.team_id as string,
              team_name: bid.team_name as string,
              bid_amount: Number(bid.bid_amount || 0),
              created_at: bid.created_at as string,
            }))
          );
        }
      }
    }

    const auctionsWithSellerImages = formattedData.map((auction: any) => ({
      ...auction,
      seller_team_image_url: auction.seller_team_id ? (sellerTeamImageMap.get(auction.seller_team_id) || null) : null,
      seller_team_name: auction.seller_team_id ? (sellerTeamNameMap.get(auction.seller_team_id) || null) : null,
      highest_bidder_team_name: auction.highest_bidder_id
        ? (bidderTeamNameMap.get(auction.highest_bidder_id) || null)
        : null,
      incoming_bids: incomingBidsByAuction.get(auction.id) || [],
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
        const buyerImage = row.buyer_team_id ? (teamImageById.get(row.buyer_team_id) || null) : null;

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

        if (!row.seller_team_id && row.buyer_team_id) {
          return {
            id: `sale-${row.id}`,
            title: 'Spieler vom Markt gekauft',
            message: `${buyerName} hat ${playerName} für ${priceText}€ vom Markt gekauft.`,
            created_at: row.created_at,
            team_id: row.buyer_team_id,
            team_image_url: buyerImage,
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

    if (file.size > 2 * 1024 * 1024) {
      alert('Das Profilbild darf maximal 2MB groß sein.');
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

  const loadTeamPlayers = async (teamId: string, tournamentId?: string) => {
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

    const probabilityMap = new Map<string, { appearance_probability?: string; is_wildcard?: boolean }>();
    const selectedTournamentId = tournamentId || activeTournamentId;

    if (selectedTournamentId) {
      const { data: probabilities, error: probabilitiesError } = await supabase
        .from('tournament_players')
        .select('player_id, appearance_probability, is_wildcard')
        .eq('tournament_id', selectedTournamentId)
        .in('player_id', playerIds);

      if (probabilitiesError) {
        console.error('Failed to load appearance probabilities:', probabilitiesError);
      }

      for (const probability of probabilities || []) {
        probabilityMap.set(probability.player_id, {
          appearance_probability: probability.appearance_probability,
          is_wildcard: Boolean(probability.is_wildcard),
        });
      }
    }

    return [...players]
      .map((player) => ({
        ...player,
        appearance_probability: probabilityMap.get(player.id)?.appearance_probability,
        is_wildcard: probabilityMap.get(player.id)?.is_wildcard,
      }))
      .filter((player) => {
        if (!selectedTournamentId) return true;
        const tournamentEntry = probabilityMap.get(player.id);
        return Boolean(tournamentEntry && tournamentEntry.appearance_probability !== 'Ausgeschlossen');
      })
      .sort((left, right) => left.ranking - right.ranking);
  };

  const loadMyTeam = async () => {
    if (!myTeamId || !activeTournamentId) {
      console.log('No myTeamId or activeTournamentId');
      return [] as Player[];
    }
    console.log('Loading team for myTeamId:', myTeamId);
    const playersWithProbability = await loadTeamPlayers(myTeamId, activeTournamentId);
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

    return playersWithProbability;
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
      .select('id, name, start_date, status, is_active')
      .eq('is_active', true)
      .order('start_date', { ascending: true });

    const loadedTournaments = (data || []) as Tournament[];
    setTournaments(loadedTournaments);

    if (loadedTournaments.length === 0) {
      setActiveTournamentId('');
      setActiveTournament(null);
      return;
    }

    const hasCurrentSelection = loadedTournaments.some((tournament) => tournament.id === activeTournamentId);
    if (hasCurrentSelection) {
      return;
    }

    const ongoingTournament = loadedTournaments.find((tournament) => tournament.status === 'on-going');
    const defaultTournament = ongoingTournament || loadedTournaments[0];
    setActiveTournamentId(defaultTournament.id);
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

  const placeBid = async (auctionId: string, bidAmount: number): Promise<boolean> => {
    if (!myTeamId) return false;
    if (!Number.isFinite(bidAmount) || bidAmount <= 0) {
      alert('Bitte ein gültiges Gebot eingeben.');
      return false;
    }
    const auction = auctions.find(a => a.id === auctionId);
    if (auction?.seller_team_id === myTeamId) {
      alert('Du kannst nicht auf deine eigenen angebotenen Spieler bieten.');
      return false;
    }
    const otherBidsTotal = auctions
      .filter(a => a.id !== auctionId)
      .reduce((sum, a) => sum + (a.my_bid || 0), 0);
    if (myBudget !== null && otherBidsTotal + bidAmount > myBudget) {
      alert(`Deine gesamten Gebote (${(otherBidsTotal + bidAmount).toLocaleString('de-DE')}€) würden dein Budget von ${myBudget.toLocaleString('de-DE')}€ überschreiten.`);
      return false;
    }
    const response = await fetch('/api/league/auctions/bid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auctionId, bidAmount, leagueId }),
    });

    const payload = await response.json();
    if (!response.ok) {
      alert(payload?.error || 'Gebot fehlgeschlagen');
      return false;
    }

    // Refresh budget after successful bid
    const { data: updatedTeam } = await supabase
      .from('fantasy_teams')
      .select('budget')
      .eq('id', myTeamId)
      .single();
    if (updatedTeam?.budget != null) setMyBudget(updatedTeam.budget);

    await loadAuctions();
    return true;
  };

  const closeBidSheet = () => {
    setActiveBidAuction(null);
    setBidDraftAmount('');
  };

  const openBidSheet = (auction: Auction) => {
    if (auction.seller_team_id === myTeamId) return;
    setActiveBidAuction(auction);
    setBidDraftAmount(auction.my_bid ? String(auction.my_bid) : '');
  };

  const submitBidFromSheet = async () => {
    if (!activeBidAuction) return;
    const parsed = Number(bidDraftAmount);
    const success = await placeBid(activeBidAuction.id, parsed);
    if (success) {
      closeBidSheet();
    }
  };

  const toggleAuctionGroupCollapse = (groupKey: string) => {
    setCollapsedAuctionGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const acceptHighestBid = async (auctionId: string, bidderTeamId?: string) => {
    if (!myTeamId) return;

    const response = await fetch('/api/league/player-sales/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auctionId, leagueId, bidderTeamId }),
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
    if (diffMs <= 0) {
      return {
        label: 'Abgelaufen',
        urgent: true,
        badgeClass: 'bg-red-100 text-red-700 border border-red-300',
        showPulse: true,
      };
    }

    const totalMinutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const lessThanThirtyMinutes = totalMinutes < 30;
    const lessThanTwoHours = diffMs <= 2 * 60 * 60 * 1000;
    const lessThanSixHours = diffMs <= 6 * 60 * 60 * 1000;

    const badgeClass = lessThanThirtyMinutes
      ? 'bg-red-100 text-red-700 border border-red-300'
      : lessThanTwoHours
        ? 'bg-red-50 text-red-700 border border-red-200'
        : lessThanSixHours
          ? 'bg-orange-50 text-orange-700 border border-orange-200'
          : 'bg-emerald-50 text-emerald-700 border border-emerald-200';

    const showPulse = lessThanThirtyMinutes;

    if (hours >= 1) {
      return { label: `${hours}h`, urgent: lessThanTwoHours, badgeClass, showPulse };
    }

    return {
      label: `${Math.max(totalMinutes, 0)}min`,
      urgent: lessThanTwoHours,
      badgeClass,
      showPulse,
    };
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

    const allowedPlayerIds = new Set(myTeam.map((player) => player.id));

    const selectedPlayers = nextSlots
      .map((player, slotIndex) => {
        if (!player) return null;
        if (!allowedPlayerIds.has(player.id)) return null;
        return { playerId: player.id, slotIndex };
      })
      .filter((entry): entry is { playerId: string; slotIndex: number } => Boolean(entry));

    await supabase
      .from('tournament_lineups')
      .delete()
      .eq('tournament_id', activeTournamentId)
      .eq('team_id', myTeamId);

    if (selectedPlayers.length === 0) return;

    const inserts = selectedPlayers.map(({ playerId, slotIndex }) => ({
      tournament_id: activeTournamentId,
      team_id: myTeamId,
      player_id: playerId,
      slot_index: slotIndex,
    }));

    await supabase.from('tournament_lineups').insert(inserts);
  };

  const applyLineupUpdate = async (nextSlots: LineupSlot[]) => {
    // Block lineup changes if tournament is on-going
    if (activeTournament?.status === 'on-going') {
      alert('Aufstellungsänderungen sind nicht mehr möglich, da das Turnier bereits läuft!');
      return;
    }

    const reserveValidationError = getReserveValidationError(nextSlots);
    if (reserveValidationError) {
      alert(reserveValidationError);
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
    setTeamInspection({
      team,
      squad: [],
      lineupSlots: createEmptyLineupSlots(MAIN_LINEUP_SLOT_COUNT),
      reserveSlots: createEmptyLineupSlots(RESERVE_LINEUP_SLOT_COUNT),
    });

    try {
      const squad = await loadTeamPlayers(team.id, activeTournamentId);

      let lineupSlots = createEmptyLineupSlots(MAIN_LINEUP_SLOT_COUNT);
      let reserveSlots = createEmptyLineupSlots(RESERVE_LINEUP_SLOT_COUNT);
      if (activeTournamentId) {
        const { data: lineupData, error: lineupError } = await supabase
          .from('tournament_lineups')
          .select('slot_index, player:players(id, first_name, last_name, ranking, country, image_url)')
          .eq('tournament_id', activeTournamentId)
          .eq('team_id', team.id)
          .order('slot_index', { ascending: true });

        if (lineupError) {
          console.error('Failed to load team lineup:', lineupError);
        }

        const squadMap = new Map(squad.map((player) => [player.id, player]));
        const combinedSlots = createEmptyLineupSlots(TOTAL_LINEUP_SLOT_COUNT);
        for (const entry of lineupData || []) {
          const player = Array.isArray((entry as any).player) ? (entry as any).player[0] : (entry as any).player;
          const slotIndex = Number((entry as any).slot_index);
          if (!player || !Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= TOTAL_LINEUP_SLOT_COUNT) {
            continue;
          }
          combinedSlots[slotIndex] = squadMap.get(player.id) || player;
        }

        lineupSlots = combinedSlots.slice(0, MAIN_LINEUP_SLOT_COUNT);
        reserveSlots = combinedSlots.slice(RESERVE_SLOT_START_INDEX);
      }

      setTeamInspection({ team, squad, lineupSlots, reserveSlots });
    } catch (error) {
      console.error('Failed to inspect team:', error);
      setTeamInspection({
        team,
        squad: [],
        lineupSlots: createEmptyLineupSlots(MAIN_LINEUP_SLOT_COUNT),
        reserveSlots: createEmptyLineupSlots(RESERVE_LINEUP_SLOT_COUNT),
      });
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
  const isLineupLocked = activeTournament?.status === 'on-going';
  const myTournamentRank = useMemo(() => {
    if (!myTeamId) return null;
    const index = leaderboard.findIndex((team) => team.id === myTeamId);
    return index >= 0 ? index + 1 : null;
  }, [leaderboard, myTeamId]);
  const inspectedTeamRank = useMemo(() => {
    if (!teamInspection?.team.id) return null;
    const index = leaderboard.findIndex((team) => team.id === teamInspection.team.id);
    return index >= 0 ? index + 1 : null;
  }, [leaderboard, teamInspection]);
  const reserveLineupSlots = lineupSlots.slice(RESERVE_SLOT_START_INDEX);
  const inspectionLineupPositions = [
    'left-3 top-4 sm:left-8 sm:top-6',
    'right-3 top-4 sm:right-8 sm:top-6',
    'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
    'left-3 bottom-4 sm:left-8 sm:bottom-6',
    'right-3 bottom-4 sm:right-8 sm:bottom-6',
  ];

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 px-6 pb-6 pt-5 max-w-4xl mx-auto">

      {/* tabs */}
      <nav
        className={`sticky top-0 z-30 -mx-6 border-b border-zinc-200 bg-zinc-50/95 px-6 pt-2 backdrop-blur-md overflow-x-auto ${
          activeTab === 'auctions' ? 'mb-4' : 'mb-8'
        }`}
      >
        <div className="grid grid-flow-col auto-cols-fr gap-2 min-w-[640px]">
          {['leaderboard','auctions','myteam','tournaments','news'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`w-full pb-2 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === tab ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-zinc-600 hover:text-zinc-900'}`}
            >
              {tab === 'leaderboard' ? 'Rangliste' : tab === 'auctions' ? 'Transfermarkt' : tab === 'myteam' ? 'Mein Team' : tab === 'tournaments' ? 'Turniere & Aufstellung' : 'News'}
            </button>
          ))}
        </div>
      </nav>

      {activeTab === 'leaderboard' && (
        <div>
          {/* Sticky header with backdrop-blur */}
          <div className="sticky top-[64px] z-10 -mx-6 px-6 pt-3 pb-3 bg-zinc-50/90 backdrop-blur-md border-b border-zinc-200/70 mb-4">
            <h2 className="text-lg font-bold tracking-tight text-zinc-900 mb-2" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>Rangliste</h2>
            {/* Horizontal tournament pill buttons */}
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {tournaments.map((tournament) => (
                <button
                  key={`lb-pill-${tournament.id}`}
                  onClick={() => setActiveTournamentId(tournament.id)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95 ${
                    activeTournamentId === tournament.id
                      ? 'border-zinc-900 bg-zinc-900 text-white shadow-sm'
                      : 'border-zinc-300 bg-white text-zinc-600 hover:border-zinc-400 hover:text-zinc-900'
                  }`}
                >
                  {tournament.name}
                </button>
              ))}
            </div>
          </div>

          {!activeTournamentId ? (
            <div className="mb-4 p-4 bg-white rounded-xl shadow-sm border border-zinc-100 text-zinc-500">
              Kein aktives Turnier ausgewaehlt.
            </div>
          ) : null}

          <ul className="space-y-2 pb-20" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
            {leaderboard.map((team, index) => {
              const rank = index + 1;
              const isMe = team.id === myTeamId;
              const isTop3 = rank <= 3;
              const medalEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;

              const avatarRingClass =
                rank === 1
                  ? 'ring-2 ring-amber-400 ring-offset-1'
                  : rank === 2
                    ? 'ring-2 ring-zinc-300 ring-offset-1'
                    : rank === 3
                      ? 'ring-2 ring-amber-600/60 ring-offset-1'
                      : '';

              const cardBgClass = isMe
                ? 'bg-emerald-50 border-emerald-200 shadow-[0_0_0_1.5px_rgba(16,185,129,0.25),0_4px_16px_rgba(16,185,129,0.1)]'
                : rank === 1
                  ? 'bg-gradient-to-r from-amber-50 to-yellow-50/60 border-amber-200/80'
                  : rank === 2
                    ? 'bg-gradient-to-r from-slate-50 to-zinc-50 border-zinc-200'
                    : rank === 3
                      ? 'bg-gradient-to-r from-orange-50/80 to-amber-50/40 border-orange-200/70'
                      : 'bg-white border-zinc-100';

              const pointsClass =
                team.total_points_scored < 0
                  ? 'text-red-600 font-bold'
                  : rank === 1
                    ? 'text-amber-500 text-xl font-extrabold'
                    : rank === 2
                      ? 'text-zinc-500 text-lg font-bold'
                      : rank === 3
                        ? 'text-amber-600 text-lg font-bold'
                        : isMe
                          ? 'text-emerald-700 font-bold'
                          : 'text-zinc-600 font-semibold';

              return (
                <li key={team.id} ref={isMe ? myLeaderboardRowRef : undefined}>
                  <button
                    onClick={() => {
                      if (!isMe) openTeamInspection(team);
                    }}
                    className={`relative w-full flex items-center gap-3 ${isTop3 ? 'p-4' : 'p-3'} rounded-xl border text-left transition-all duration-200 active:scale-[0.98] shadow-sm ${cardBgClass} ${isMe ? 'cursor-default' : 'hover:shadow-md hover:border-zinc-200'}`}
                  >
                    {/* Emerald left-stripe for "me" */}
                    {isMe && (
                      <span className="absolute inset-y-0 left-0 w-[3px] rounded-l-xl bg-emerald-500" />
                    )}

                    {/* Rank / Medal */}
                    <div className="w-8 flex-shrink-0 flex justify-center">
                      {medalEmoji ? (
                        <span className={rank === 1 ? 'text-2xl' : 'text-xl'}>{medalEmoji}</span>
                      ) : (
                        <span className={`text-sm font-bold ${isMe ? 'text-emerald-600' : 'text-zinc-400'}`}>
                          {rank}.
                        </span>
                      )}
                    </div>

                    {/* Avatar with medal ring */}
                    <div
                      className={`${isTop3 ? 'w-11 h-11' : 'w-9 h-9'} rounded-full overflow-hidden bg-zinc-200 border border-zinc-300 shrink-0 flex items-center justify-center ${avatarRingClass}`}
                    >
                      {team.profile_image_url ? (
                        <img src={team.profile_image_url} alt={team.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className={`${isTop3 ? 'text-sm' : 'text-xs'} font-semibold text-zinc-600`}>
                          {team.name?.charAt(0)?.toUpperCase() || '?'}
                        </span>
                      )}
                    </div>

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <span className={`block truncate ${isTop3 ? 'text-base' : 'text-sm'} font-semibold text-zinc-900`}>
                        {team.name}
                        {isMe && <span className="ml-1.5 text-emerald-600">(Du)</span>}
                      </span>
                    </div>

                    {/* Points + profile image upload */}
                    <div className="flex-shrink-0 flex items-center gap-2">
                      {isMe && (
                        <label className="text-xs px-2 py-1 rounded-md border border-emerald-300 text-emerald-700 hover:bg-emerald-100 cursor-pointer whitespace-nowrap">
                          Profilbild
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={uploadTeamProfileImage}
                          />
                        </label>
                      )}
                      <div className="text-right">
                        <span className={`${pointsClass} leading-none`}>
                          {team.total_points_scored}
                        </span>
                        <span className="ml-1 text-xs text-zinc-400">Pkt</span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex justify-end">
            <button
              onClick={() => window.location.assign('/dashboard')}
              className="px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors"
            >
              Zurueck zum Dashboard
            </button>
          </div>

          {/* Sticky "me" banner — appears at bottom when my row is scrolled out of view */}
          {!isMyLeaderboardRowVisible && myTeamId && (() => {
            const myIndex = leaderboard.findIndex((t) => t.id === myTeamId);
            if (myIndex < 0) return null;
            const myEntry = leaderboard[myIndex];
            const teamAbove = myIndex > 0 ? leaderboard[myIndex - 1] : null;
            const ptsDiff = teamAbove ? teamAbove.total_points_scored - myEntry.total_points_scored : null;
            return (
              <div
                className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-t-2 border-emerald-400 shadow-[0_-4px_24px_rgba(0,0,0,0.15)]"
                style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}
              >
                <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-sm font-bold text-emerald-600 w-7 text-center flex-shrink-0">
                      {myIndex + 1}.
                    </span>
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-200 border-2 border-emerald-500 shrink-0 flex items-center justify-center">
                      {myEntry.profile_image_url ? (
                        <img src={myEntry.profile_image_url} alt={myEntry.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs font-semibold text-zinc-600">{myEntry.name?.charAt(0)?.toUpperCase() || '?'}</span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-zinc-900 truncate">
                      {myEntry.name} <span className="text-emerald-600">(Du)</span>
                    </span>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-sm font-bold text-zinc-900">{myEntry.total_points_scored} Pkt</p>
                    {ptsDiff !== null && ptsDiff > 0 && (
                      <p className="text-xs text-zinc-500">{ptsDiff} Pkt zum nächsten Platz</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {activeTab === 'auctions' && (
        <div className="rounded-2xl bg-zinc-100/80 border border-zinc-200 p-3 sm:p-4">
          {(() => {
            const marketFilters = tournaments.filter((tournament) => tournament.status === 'upcoming');
            return (
              <div className="mb-4 min-w-0 space-y-1">
                <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <button
                    onClick={() => setMarketTournamentFilterId('all')}
                    className={`shrink-0 rounded-2xl border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95 ${marketTournamentFilterId === 'all' ? 'border-zinc-800 bg-zinc-800 text-zinc-50 shadow-[0_6px_14px_rgba(15,23,42,0.18)]' : 'border-zinc-300 bg-zinc-50 text-zinc-600 hover:border-zinc-400 hover:bg-white hover:text-zinc-900'}`}
                  >
                    Alle Upcoming-Turniere
                  </button>
                  {marketFilters.map((tournament) => {
                    const accentClass = getTournamentAccentClassByMeta(tournament.name, tournament.id);
                    const isActiveFilter = marketTournamentFilterId === tournament.id;

                    return (
                      <button
                        key={`market-filter-${tournament.id}`}
                        onClick={() => setMarketTournamentFilterId(tournament.id)}
                        className={`shrink-0 rounded-2xl border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95 ${isActiveFilter ? `${accentClass} border-transparent text-white shadow-[0_6px_14px_rgba(15,23,42,0.16)]` : 'border-zinc-300 bg-zinc-50 text-zinc-600 hover:border-zinc-400 hover:bg-white hover:text-zinc-900'}`}
                      >
                        {tournament.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          {(() => {
            const groupedAuctions = auctions.reduce((map, auction) => {
              const key = auction.tournament_id || auction.tournament_name || 'no-tournament';
              const existing = map.get(key) || [];
              existing.push(auction);
              map.set(key, existing);
              return map;
            }, new Map<string, Auction[]>());

            return (
              <div className="space-y-4">
                {Array.from(groupedAuctions.entries()).map(([groupKey, groupAuctions]) => {
                  const groupRepresentative = groupAuctions[0];
                  const groupFlag = countryCodeToFlag(groupRepresentative.tournament_country_code || null);
                  const groupName = groupRepresentative.tournament_name || 'Ohne Turnier';
                  const groupAccentClass = getTournamentAccentClass(groupRepresentative);
                  const isGroupCollapsed = collapsedAuctionGroups.has(groupKey);
                  const groupContentId = `auction-group-${groupKey}`;
                  return (
                    <section key={groupKey} className="space-y-2">
                      <button
                        type="button"
                        onClick={() => toggleAuctionGroupCollapse(groupKey)}
                        aria-expanded={!isGroupCollapsed}
                        aria-controls={groupContentId}
                        className="sticky top-0 z-10 w-full rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-left shadow-[0_10px_24px_rgba(15,23,42,0.08)] backdrop-blur-[10px]"
                      >
                        <div className="flex items-stretch gap-2">
                          <div className="min-w-0 flex flex-1 items-center max-w-[66%] rounded-lg border border-zinc-200/80 bg-white/85 px-2.5 py-1.5">
                            <div className="flex w-full items-center justify-between gap-2">
                              <div className="min-w-0 flex items-center gap-2">
                                <span className="truncate text-xs font-semibold uppercase tracking-wide text-zinc-600">
                                  {groupFlag ? `${groupFlag} ` : ''}
                                  {groupName}
                                </span>
                                <span className={`rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 ${sportyNumberClass}`}>
                                  {groupAuctions.length}
                                </span>
                              </div>
                              <ChevronDown
                                className={`h-4 w-4 text-zinc-500 transition-transform duration-200 ${isGroupCollapsed ? '' : 'rotate-180'}`}
                                strokeWidth={2.2}
                              />
                            </div>
                          </div>
                          {myBudget !== null && (
                            <div className={`inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/35 px-3 py-1.5 text-zinc-100 shadow-[0_8px_18px_rgba(15,23,42,0.22)] ${groupAccentClass}`}>
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/20 text-emerald-300">
                                <Coins className="h-3.5 w-3.5" strokeWidth={2.1} />
                              </span>
                              <div className="leading-none">
                                <p className="text-[9px] uppercase tracking-[0.16em] text-white/80">Wallet</p>
                                <p className={`mt-0.5 text-sm font-extrabold text-emerald-200 ${sportyNumberClass}`}>
                                  {formatCurrency(myBudget)}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </button>
                      <ul id={groupContentId} className={`${isGroupCollapsed ? 'hidden' : 'space-y-2'}`}>
                        {groupAuctions.map((auction) => {
                          const probInfo = getProbabilityIcon(auction.appearance_probability);
                          const isWildcard = Boolean(auction.is_wildcard);
                          const remaining = getRemainingTime(auction.end_time);
                          const isOwnSale = auction.seller_team_id === myTeamId;
                          const isActivePlayer = auction.appearance_probability !== 'Ausgeschlossen';
                          const playerFlag = countryCodeToFlag(auction.player.country || null);
                          const seedingLabel = auction.seeding_status
                            ? auction.seeding_status === 'Top-Seed'
                              ? `Top-Seed${auction.tournament_seed_position ? ` #${auction.tournament_seed_position}` : ''}`
                              : auction.seeding_status === 'Gesetzt'
                                ? `Gesetzt${auction.tournament_seed_position ? ` #${auction.tournament_seed_position}` : ''}`
                                : auction.seeding_status === 'Main-Draw'
                                  ? `Main-Draw${auction.tournament_seed_position ? ` #${auction.tournament_seed_position}` : ''}`
                                  : auction.seeding_status
                            : null;
                          const seedingBadgeClass = getSeedingBadgeClass(auction.seeding_status);
                          const accentClass = getTournamentAccentClass(auction);

                          return (
                            <li
                              key={auction.id}
                              className={`relative overflow-hidden rounded-2xl bg-white border border-[#efefef] shadow-[0_8px_18px_rgba(15,23,42,0.07)] transition-all duration-200 hover:shadow-[0_10px_24px_rgba(15,23,42,0.10)] ${isOwnSale ? 'ring-1 ring-orange-300' : ''}`}
                            >
                              <div className={`absolute inset-y-0 left-0 w-1 ${accentClass}`} />
                              <div className="pl-4 pr-3 py-3">
                                <div className="flex items-start justify-between gap-2">
                                  <button
                                    onClick={() => openPlayerHistory({
                                      id: auction.player_id,
                                      first_name: getAuctionDisplayFirstName(auction),
                                      last_name: getAuctionDisplayLastName(auction),
                                      ranking: auction.player.ranking,
                                      country: auction.player.country,
                                      image_url: auction.player.image_url,
                                    })}
                                    className="min-w-0 text-left"
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className={`rounded-full p-[2px] transition-colors duration-200 ${isActivePlayer ? 'bg-emerald-500' : 'bg-zinc-300'}`}>
                                        <img
                                          src={auction.player.image_url || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/player-images/default.png`}
                                          alt={`${getAuctionDisplayFirstName(auction)} ${getAuctionDisplayLastName(auction)}`}
                                          className="w-10 h-10 rounded-full object-cover bg-zinc-100"
                                        />
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-[16px] leading-tight truncate">
                                          {playerFlag ? <span className="mr-1">{playerFlag}</span> : null}
                                          <span className="font-bold text-zinc-900">{getAuctionDisplayLastName(auction)}</span>
                                        </p>
                                        <div className="flex items-center gap-1.5 mt-1">
                                          <span className={`text-sm ${probInfo.color}`} title={probInfo.label}>{probInfo.icon}</span>
                                          {isWildcard && (
                                            <span className="inline-flex items-center rounded-md bg-emerald-900 px-1.5 py-0.5 text-[10px] font-bold text-emerald-50" title="Wildcard">
                                              WC
                                            </span>
                                          )}
                                          {seedingLabel && (
                                            <span
                                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${seedingBadgeClass}`}
                                              style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}
                                              title="Seeding im Turnier"
                                            >
                                              {hasPrioritySeedingStar(auction.seeding_status) ? (
                                                <Star className="h-3 w-3 text-amber-300" fill="currentColor" strokeWidth={1.6} />
                                              ) : null}
                                              {seedingLabel}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </button>

                                  <div className="shrink-0 text-right">
                                    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full transition-colors duration-200 ${remaining.badgeClass}`}>
                                      <Clock3 className="h-3.5 w-3.5" strokeWidth={2.15} />
                                      {remaining.showPulse ? <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" /> : null}
                                      <span className={sportyNumberClass}>{remaining.label}</span>
                                    </span>
                                    <p className="mt-1 text-[9px] uppercase tracking-[0.18em] text-zinc-400">Marktwert</p>
                                    <p className={`leading-none text-[21px] font-extrabold text-emerald-800 ${sportyNumberClass}`}>
                                      {(auction.market_value || 0).toLocaleString('de-DE')}
                                      <span className="ml-0.5 align-top text-[12px] font-semibold text-emerald-700/80">€</span>
                                    </p>
                                  </div>
                                </div>

                                <div className="mt-2 flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {auction.seller_team_name ? (
                                      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-600 truncate">
                                        {auction.seller_team_image_url && (
                                          <img
                                            src={auction.seller_team_image_url}
                                            alt={auction.seller_team_name}
                                            className="w-5 h-5 rounded-full object-cover border border-zinc-200"
                                          />
                                        )}
                                        <span className="truncate">{auction.seller_team_name}</span>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500">
                                        <Bot className="h-3 w-3" strokeWidth={2.1} />
                                        System
                                      </span>
                                    )}
                                  </div>

                                  {isOwnSale ? (
                                    <span className="text-xs font-medium text-zinc-500">Dein Angebot</span>
                                  ) : (
                                    <button
                                      onClick={() => openBidSheet(auction)}
                                      className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-transform duration-150 hover:bg-emerald-500 active:scale-95 shadow-[0_6px_16px_rgba(16,185,129,0.35)]"
                                    >
                                      <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} />
                                      <span>Bieten</span>
                                    </button>
                                  )}
                                </div>

                                {auction.my_bid ? (
                                  <div className="mt-2 flex items-center gap-2">
                                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/90 px-2.5 py-1.5 text-xs text-emerald-900 shadow-[0_4px_12px_rgba(16,185,129,0.14)]">
                                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700/80">Dein Gebot</span>
                                      <span className={`font-extrabold text-emerald-800 ${sportyNumberClass}`}>
                                        {formatCurrency(auction.my_bid)}
                                      </span>
                                    </span>
                                    <button
                                      onClick={() => withdrawBid(auction.id)}
                                      className="inline-flex items-center gap-1 rounded-xl border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 shadow-[0_4px_10px_rgba(239,68,68,0.12)] transition-colors hover:bg-red-50"
                                    >
                                      <X className="h-3.5 w-3.5" strokeWidth={2.2} />
                                      Zurückziehen
                                    </button>
                                  </div>
                                ) : null}

                                {isOwnSale && (auction.incoming_bids?.length || 0) > 0 && (
                                  <div className="mt-2 space-y-1.5">
                                    <p className="text-xs font-semibold text-zinc-600">Eingegangene Gebote</p>
                                    <ul className="space-y-1.5">
                                      {(auction.incoming_bids || []).map((bid) => (
                                        <li key={`${auction.id}-${bid.team_id}`} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5">
                                          <div className="text-xs text-zinc-700 truncate">
                                            <span className="font-semibold text-zinc-900">{formatCurrency(bid.bid_amount)}</span>
                                            <span> von </span>
                                            <span className="font-semibold text-zinc-900">{bid.team_name}</span>
                                          </div>
                                          <button
                                            onClick={() => acceptHighestBid(auction.id, bid.team_id)}
                                            className="text-[11px] px-2 py-1 rounded-full border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                          >
                                            Annehmen
                                          </button>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {isOwnSale && (
                                  <div className="mt-2">
                                    <button
                                      onClick={() => cancelPlayerSale(auction.id)}
                                      className="text-[11px] px-2.5 py-1 rounded-full border border-red-300 text-red-700 hover:bg-red-50"
                                    >
                                      Angebot stornieren
                                    </button>
                                  </div>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {activeTab === 'myteam' && (
        <div className="space-y-4">
          <div className="-mx-6 mb-4 border-b border-zinc-200/70 bg-zinc-50/90 px-6 pb-4 pt-3 backdrop-blur-md">
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold tracking-tight text-zinc-900" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
                    Mein Team
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Kompakte Uebersicht mit Form, Marktwert und direktem Zugriff auf Transfers.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white/75 px-3 py-2 text-right shadow-[0_10px_30px_rgba(15,23,42,0.07)] backdrop-blur-[10px]">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Kader</p>
                  <p className="text-lg font-bold text-zinc-900">{myTeam.length}<span className="ml-1 text-sm font-medium text-zinc-500">Spieler</span></p>
                </div>
              </div>

              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {tournaments.map((tournament) => {
                  const accentClass = getTournamentAccentClassByMeta(tournament.name, tournament.id);
                  const isSelected = activeTournamentId === tournament.id;

                  return (
                    <button
                      key={`myteam-filter-${tournament.id}`}
                      onClick={() => {
                        setActiveTournamentId(tournament.id);
                        closeLineupEditMode();
                        setLineupSlots(createEmptyLineupSlots(TOTAL_LINEUP_SLOT_COUNT));
                      }}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95 ${isSelected ? `${accentClass} border-transparent text-white shadow-sm` : 'border-zinc-300 bg-white text-zinc-600 hover:border-zinc-400 hover:text-zinc-900'}`}
                    >
                      {tournament.name}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-2xl border border-emerald-200 bg-white/85 px-3 py-2.5 shadow-[0_10px_30px_rgba(16,185,129,0.07)] backdrop-blur-[10px]">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Gesamtwert</p>
                  <p className="mt-1 text-lg font-bold text-emerald-800">{formatCurrency(myTeamTotalMarketValue)}</p>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white/85 px-3 py-2.5 shadow-[0_10px_30px_rgba(15,23,42,0.05)] backdrop-blur-[10px]">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Turnierpunkte</p>
                  <p className={`mt-1 text-lg font-bold ${getPointsTextClass(myTeamTotalPoints)}`}>{myTeamTotalPoints} Pkt</p>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white/85 px-3 py-2.5 shadow-[0_10px_30px_rgba(15,23,42,0.05)] backdrop-blur-[10px]">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Im Kader</p>
                  <p className="mt-1 text-lg font-bold text-zinc-900">{myTeam.length}</p>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white/85 px-3 py-2.5 shadow-[0_10px_30px_rgba(15,23,42,0.05)] backdrop-blur-[10px]">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Freie Slots</p>
                  <p className="mt-1 text-lg font-bold text-zinc-900">{myTeamPlaceholderCount}</p>
                </div>
              </div>
            </div>
          </div>

          {!activeTournamentId ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-zinc-500 shadow-sm">
              Kein aktives Turnier ausgewaehlt.
            </div>
          ) : null}

          {activeTournamentId ? (
            <ul className="space-y-2">
              {myTeam.map((player) => {
                const probInfo = getProbabilityIcon(player.appearance_probability);
                const isWildcard = Boolean(player.is_wildcard);
                const marketValue = playerMarketValues.get(player.id) || 0;
                const playerPoints = playerTournamentPoints.get(player.id) || 0;
                const isActivePlayer = player.appearance_probability !== 'Ausgeschlossen';

                return (
                  <li
                    key={player.id}
                    className="group rounded-2xl border border-[#ececec] bg-white px-3 py-3 shadow-[0_10px_28px_rgba(15,23,42,0.07)] transition-all duration-200 hover:border-zinc-200 hover:shadow-[0_14px_34px_rgba(15,23,42,0.10)]"
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                      <button
                        onClick={() => openPlayerHistory(player)}
                        className="min-w-0 text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`rounded-full p-[2px] transition-colors duration-200 ${isActivePlayer ? 'bg-emerald-500' : 'bg-zinc-300'}`}>
                            <img
                              src={player.image_url || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/player-images/default.png`}
                              alt={`${player.first_name} ${player.last_name}`}
                              className="h-12 w-12 rounded-full bg-zinc-100 object-cover"
                            />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate text-[15px] leading-tight text-zinc-900">
                                <span className="font-bold">{player.first_name} {player.last_name}</span>
                              </p>
                              {isWildcard ? (
                                <span
                                  className="inline-flex items-center rounded-md bg-emerald-900 px-1.5 py-0.5 text-[10px] font-bold text-emerald-50"
                                  title="Wildcard"
                                >
                                  WC
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                              <span>#{player.ranking}</span>
                              <span className={`text-sm ${probInfo.color}`} title={probInfo.label}>{probInfo.icon}</span>
                              <span className="truncate">{probInfo.label}</span>
                            </div>
                          </div>
                        </div>
                      </button>

                      <div className="shrink-0 text-right">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Punkte</p>
                        <p className={`text-[24px] font-extrabold leading-none ${getPointsTextClass(playerPoints)}`}>
                          {playerPoints}
                        </p>
                        <p className="mt-1 text-xs font-medium text-zinc-500">{formatCurrency(marketValue)}</p>
                      </div>

                      <div className="flex items-center justify-end">
                        <button
                          onClick={() => {
                            setPlayerToSell(player);
                            setShowSaleModal(true);
                          }}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-orange-200 text-orange-600 transition-colors duration-150 hover:bg-orange-50"
                          title={`${player.first_name} ${player.last_name} verkaufen`}
                          aria-label={`${player.first_name} ${player.last_name} verkaufen`}
                        >
                          <ArrowUpRight className="h-4 w-4" strokeWidth={2.2} />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}

              {Array.from({ length: myTeamPlaceholderCount }).map((_, index) => (
                <li key={`empty-myteam-slot-${index}`}>
                  <button
                    onClick={() => {
                      setActiveTab('auctions');
                      if (activeTournament?.status === 'upcoming') {
                        setMarketTournamentFilterId(activeTournament.id);
                      }
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-white/65 px-3 py-3 text-left shadow-[0_8px_20px_rgba(15,23,42,0.04)] transition-colors duration-150 hover:border-zinc-400 hover:bg-white"
                  >
                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-zinc-300 bg-zinc-50 text-zinc-400">
                      <Plus className="h-5 w-5" strokeWidth={2.25} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-zinc-800">Spieler kaufen</span>
                      <span className="block text-xs text-zinc-500">Freier Kaderplatz fuer den naechsten Transfer.</span>
                    </span>
                  </button>
                </li>
              ))}

              {myTeam.length === 0 && myTeamPlaceholderCount === 0 ? (
                <li className="rounded-2xl border border-zinc-200 bg-white p-5 text-center text-sm text-zinc-500 shadow-sm">
                  Noch keine Spieler im Team vorhanden.
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      )}

      {activeTab === 'tournaments' && (
        <div
          ref={lineupEditorScrollRef}
          className={isLineupEditMode ? 'max-h-[calc(100vh-10rem)] overflow-y-auto overscroll-contain pb-80 pr-1 touch-pan-y sm:max-h-[calc(100vh-12rem)] sm:pb-48' : ''}
        >
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h2 className="text-xl font-semibold">Turniere &amp; Aufstellung</h2>
              <div className="flex items-center gap-2">
                <label className="text-sm text-zinc-600">Turnier</label>
                <select
                  value={activeTournamentId}
                  onChange={(e) => {
                    setActiveTournamentId(e.target.value);
                    closeLineupEditMode();
                    setLineupSlots(createEmptyLineupSlots(TOTAL_LINEUP_SLOT_COUNT));
                  }}
                  className="px-3 py-2 rounded-lg border border-zinc-300 bg-white text-sm"
                >
                  {tournaments.map((tournament) => (
                    <option key={tournament.id} value={tournament.id}>
                      {tournament.name}
                    </option>
                  ))}
                </select>
              </div>
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
                if (isLineupEditMode) return null;

                if (activeTournament.status === 'on-going') {
                  return (
                    <div className="mb-4 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-zinc-900">{activeTournament.name}</span>
                        <span className="text-xs font-medium text-zinc-600">Live-Modus aktiv, Bearbeitung deaktiviert.</span>
                      </div>
                    </div>
                  );
                }

                if (activeTournament.status === 'upcoming') {
                  return (
                    <div className="mb-4 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-zinc-900">{activeTournament.name}</span>
                        <span className={`inline-block text-xs px-2 py-1 rounded-md ${lineupDeadline.urgent ? 'bg-orange-100 text-orange-700 font-semibold' : 'bg-sky-100 text-sky-700'}`}>
                          Restzeit Aufstellung: {lineupDeadline.label}
                        </span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="p-4 bg-white rounded-xl shadow-sm border border-zinc-100 mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Ausgewaehltes Turnier: {activeTournament.name}</span>
                        {activeTournament.status === 'completed' && (
                          <span className="inline-block text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-700">
                            Abgeschlossen
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className={`inline-block mt-1 text-xs px-2 py-1 rounded-md ${lineupDeadline.urgent ? 'bg-orange-100 text-orange-700 font-semibold' : 'bg-sky-100 text-sky-700'}`}>
                          Restzeit Aufstellung: {lineupDeadline.label}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {isLineupEditMode && notInLineupPlayers.length > 0 && (
                <div className="mb-4 p-3 sm:p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl border border-emerald-200 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 mb-2">Noch nicht aufgestellt</p>
                  <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {notInLineupPlayers.map((player) => {
                      const probInfo = getProbabilityIcon(player.appearance_probability);
                      const isWildcard = Boolean(player.is_wildcard);
                      return (
                        <button
                          key={`pill-${player.id}`}
                          onClick={() => {
                            if (slotSelectionSheet) {
                              applyPlayerToSlot(slotSelectionSheet.slotIndex, player);
                            }
                          }}
                          className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-full border border-emerald-300 bg-white hover:bg-emerald-100 text-emerald-900 transition-colors duration-150 shadow-sm"
                          title={`${player.first_name} ${player.last_name}`}
                        >
                          <img
                            src={player.image_url || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/player-images/default.png`}
                            alt={`${player.first_name} ${player.last_name}`}
                            className="w-6 h-6 rounded-full object-cover"
                          />
                          <span className="text-sm font-semibold truncate">{player.first_name}</span>
                          {isWildcard && (
                            <span className="text-xs font-bold bg-emerald-900 text-emerald-50 px-1.5 py-0.5 rounded-md">WC</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div
                ref={courtContainerRef}
                className={`${isLineupLocked ? 'bg-sky-500 border-sky-400' : 'bg-sky-300 border-sky-200'} rounded-2xl p-4 sm:p-6 shadow-md mb-5 border ${!isLineupEditMode && !isLineupLocked ? 'cursor-pointer' : ''}`}
                onClick={() => {
                  if (!isLineupEditMode && !isLineupLocked) {
                    setIsLineupEditMode(true);
                  }
                }}
              >
                {isLineupLocked && (
                  <div className="mb-3 rounded-lg border border-white/35 bg-[#0f172acc] px-3 py-1.5">
                    <p className="text-xs font-semibold text-emerald-300">
                      Gesamtpunkte: {myTeamTotalPoints} Pkt | Rang im Turnier: {myTournamentRank ? `#${myTournamentRank}` : '-'}
                    </p>
                  </div>
                )}
                {!isLineupEditMode && !isLineupLocked && (
                  <div className="mb-3 text-sm font-medium text-sky-900 bg-white/80 border border-white rounded-lg px-3 py-2">
                    Tippe auf das Feld, um den Bearbeitungsmodus zu aktivieren.
                  </div>
                )}
                <div className={`relative rounded-xl ${isLineupEditMode ? 'h-[320px] sm:h-[420px]' : 'h-[420px] sm:h-[480px]'} border-2 border-white/50 overflow-hidden ${isLineupEditMode ? 'touch-none' : ''}`}>
                  <div className="absolute inset-x-0 top-1/2 border-t-2 border-white/40" />
                  <div className="absolute top-0 bottom-0 left-[14%] border-l-2 border-white/40" />
                  <div className="absolute top-0 bottom-0 right-[14%] border-r-2 border-white/40" />
                  <div className="absolute left-[14%] right-[14%] top-[30%] border-t-2 border-white/40" />
                  <div className="absolute left-[14%] right-[14%] bottom-[30%] border-b-2 border-white/40" />
                  <div className="absolute left-1/2 -translate-x-1/2 top-[30%] bottom-[30%] border-l-2 border-white/40" />
                  <div className="absolute left-[14%] right-[14%] top-1/2 h-[2px] bg-white/40" />

                  {[0, 1, 2, 3, 4].map((slotIndex) => {
                    const positions = [
                      'left-4 top-6 sm:left-10 sm:top-8',
                      'right-4 top-6 sm:right-10 sm:top-8',
                      'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
                      'left-4 bottom-6 sm:left-10 sm:bottom-8',
                      'right-4 bottom-6 sm:right-10 sm:bottom-8',
                    ];

                    const player = lineupSlots[slotIndex];
                    const roundState = player ? playerRoundStates.get(player.id) : undefined;
                    const roundLabel = roundState?.label || 'R1/R2';
                    const isOut = roundLabel === 'OUT';
                    const showLivePulse = Boolean(
                      activeTournament?.status === 'on-going'
                      && player
                      && (roundLabel === 'QF' || (roundState?.inTournament && !isOut))
                    );
                    const displayedPoints = player ? getDisplayedLineupPoints(player, slotIndex) : 0;
                    const highlightActive = Boolean(
                      player
                      && activeTournament?.status === 'on-going'
                      && (roundState ? roundState.inTournament : true)
                    );
                    const isSlotInvalid = !isPlayerValidForSlot(player, slotIndex);
                    const slotValidationClass = getSlotValidationClass(player, slotIndex);
                    
                    return (
                      <div
                        key={slotIndex}
                        className={`absolute ${positions[slotIndex]} w-28 sm:w-32`}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDropOnSlot(slotIndex)}
                        data-lineup-slot-index={slotIndex}
                      >
                        {player ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isLineupEditMode) {
                                setSlotSelectionSheet({ slotIndex });
                              }
                            }}
                            draggable={isLineupEditMode}
                            onDragStart={() => handleDragStartFromSlot(slotIndex)}
                            onTouchStart={(e) => startTouchDragCandidate(player.id, slotIndex, e)}
                            onTouchMove={handleTouchMoveForDrag}
                            onTouchEnd={endTouchDrag}
                            onTouchCancel={handleTouchCancelDrag}
                            className={`relative w-full rounded-xl border-2 border-emerald-300 bg-white/95 p-2.5 text-center shadow-md transition-all duration-200 ${selectedFromSlot === slotIndex ? 'ring-4 ring-emerald-400 ring-offset-2' : ''} ${showLivePulse ? 'animate-[pulse_4.2s_ease-in-out_infinite] shadow-[0_0_0_1px_rgba(74,222,128,0.14),0_0_6px_rgba(74,222,128,0.1)]' : ''} ${slotValidationClass} ${isLineupEditMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer hover:shadow-lg'}`}
                            title={formatLineupPlayerName(player)}
                          >
                            {isSlotInvalid && (
                              <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-white text-xs font-bold" title="Ungültiger Slot">!</div>
                            )}
                            <img
                              src={player.image_url || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/player-images/default.png`}
                              alt={`${player.first_name} ${player.last_name}`}
                              className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover mx-auto border-2 ${highlightActive ? 'border-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.25)]' : 'border-zinc-200'} ${isOut ? 'opacity-60' : ''}`}
                            />
                            <p className="text-xs font-semibold mt-1 truncate">{formatLineupPlayerName(player)}</p>
                            <p className={`${isLineupLocked ? `mt-1 inline-flex items-center rounded-md px-1.5 py-0.5 text-[14px] leading-none font-extrabold border ${displayedPoints < 0 ? 'bg-red-100 text-red-700 border-red-200' : 'bg-emerald-950 text-lime-300 border-emerald-700'}` : `text-xs font-bold ${getPointsTextClass(displayedPoints)}`}`}>{displayedPoints} Pkt</p>
                            <p className={`text-[11px] font-semibold ${roundLabel === 'OUT' ? 'text-red-600' : 'text-sky-700'}`}>{roundLabel}</p>
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isLineupEditMode) {
                                setSlotSelectionSheet({ slotIndex });
                              } else {
                                setIsLineupEditMode(true);
                              }
                            }}
                            className="relative w-full rounded-xl border-2 border-dashed border-white/60 bg-white/30 p-2.5 text-center transition-all duration-200 hover:border-white/80 hover:bg-white/50"
                            title="Spieler hinzufügen"
                          >
                            <div className="flex flex-col items-center justify-center py-3">
                              <Plus className="h-6 w-6 text-white/80 mb-1" strokeWidth={2} />
                              <p className="text-xs font-medium text-white/70">Slot {slotIndex + 1}</p>
                            </div>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div
                className={`rounded-2xl p-4 sm:p-5 shadow-md mb-5 border ${isLineupLocked ? 'bg-pink-300 border-pink-200' : 'bg-pink-100 border-pink-200'} ${!isLineupEditMode && !isLineupLocked ? 'cursor-pointer' : ''}`}
                onClick={() => {
                  if (!isLineupEditMode && !isLineupLocked) {
                    setIsLineupEditMode(true);
                  }
                }}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="font-semibold text-pink-900">New Comer</h3>
                  </div>
                </div>
                <div className={`grid grid-cols-2 ${isLineupEditMode ? 'gap-2 touch-none' : 'gap-3'}`}>
                  {reserveLineupSlots.map((player, reserveIndex) => {
                    const slotIndex = RESERVE_SLOT_START_INDEX + reserveIndex;
                    const roundState = player ? playerRoundStates.get(player.id) : undefined;
                    const roundLabel = roundState?.label || 'R1/R2';
                    const isOut = roundLabel === 'OUT';
                    const showLivePulse = Boolean(
                      activeTournament?.status === 'on-going'
                      && player
                      && (roundLabel === 'QF' || (roundState?.inTournament && !isOut))
                    );
                    const displayedPoints = player ? getDisplayedLineupPoints(player, slotIndex) : 0;
                    const highlightActive = Boolean(
                      player
                      && activeTournament?.status === 'on-going'
                      && (roundState ? roundState.inTournament : true)
                    );
                    const isSlotInvalid = !isPlayerValidForSlot(player, slotIndex);
                    const slotValidationClass = getSlotValidationClass(player, slotIndex);

                    return (
                      <div
                        key={slotIndex}
                        className="h-full"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDropOnSlot(slotIndex)}
                        data-lineup-slot-index={slotIndex}
                      >
                        {player ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isLineupEditMode) {
                                setSlotSelectionSheet({ slotIndex });
                              }
                            }}
                            draggable={isLineupEditMode}
                            onDragStart={() => handleDragStartFromSlot(slotIndex)}
                            onTouchStart={(e) => startTouchDragCandidate(player.id, slotIndex, e)}
                            onTouchMove={handleTouchMoveForDrag}
                            onTouchEnd={endTouchDrag}
                            onTouchCancel={handleTouchCancelDrag}
                            className={`relative w-full h-full rounded-xl border-2 border-pink-300 bg-white/90 p-2.5 text-center shadow-sm transition-all duration-200 ${selectedFromSlot === slotIndex ? 'ring-4 ring-emerald-400 ring-offset-2' : ''} ${showLivePulse ? 'animate-[pulse_4.2s_ease-in-out_infinite] shadow-[0_0_0_1px_rgba(74,222,128,0.12),0_0_5px_rgba(74,222,128,0.09)]' : ''} ${slotValidationClass} ${isLineupEditMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer hover:shadow-md'}`}
                            title={formatLineupPlayerName(player)}
                          >
                            {isSlotInvalid && (
                              <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center text-white text-xs font-bold shadow-md z-10" title={`Ranking muss > ${RESERVE_ELIGIBLE_RANKING_THRESHOLD} sein`}>!</div>
                            )}
                            <img
                              src={player.image_url || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/player-images/default.png`}
                              alt={`${player.first_name} ${player.last_name}`}
                              className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover mx-auto border-2 ${isSlotInvalid ? 'border-red-400' : highlightActive ? 'border-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.25)]' : 'border-pink-200'} ${isOut ? 'opacity-60' : ''}`}
                            />
                            <p className="text-xs font-semibold mt-1 truncate text-pink-950">{formatLineupPlayerName(player)}</p>
                            <p className={`${isLineupLocked ? `mt-1 inline-flex items-center rounded-md px-1.5 py-0.5 text-[14px] leading-none font-extrabold border ${displayedPoints < 0 ? 'bg-red-100 text-red-700 border-red-200' : 'bg-emerald-950 text-lime-300 border-emerald-700'}` : `text-xs font-bold ${getPointsTextClass(displayedPoints)}`}`}>{displayedPoints} Pkt</p>
                            <p className={`text-[11px] font-semibold ${roundLabel === 'OUT' ? 'text-red-600' : 'text-pink-700'}`}>{roundLabel}</p>
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isLineupEditMode) {
                                setSlotSelectionSheet({ slotIndex });
                              } else {
                                setIsLineupEditMode(true);
                              }
                            }}
                            className="w-full h-full rounded-xl border-2 border-dashed border-pink-300/60 bg-pink-50/40 p-2.5 text-center transition-all duration-200 hover:border-pink-300/80 hover:bg-pink-50/60 flex flex-col items-center justify-center"
                            title="Spieler hinzufügen"
                          >
                            <Plus className="h-5 w-5 text-pink-500/70 mb-1" strokeWidth={2} />
                            <p className="text-xs font-semibold text-pink-700">Reserve {reserveIndex + 1}</p>
                            <p className="text-xs text-pink-600 mt-0.5">Ranking &gt; {RESERVE_ELIGIBLE_RANKING_THRESHOLD}</p>
                          </button>
                        )}
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
                      const isWildcard = Boolean(player.is_wildcard);
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
                              <span className="font-medium text-zinc-900">{formatLineupPlayerName(player)}</span>
                            </div>
                            {isWildcard ? (
                              <span
                                className="inline-flex items-center rounded-md bg-emerald-900 px-2 py-0.5 text-xs font-bold text-emerald-50"
                                title="Wildcard"
                              >
                                WC
                              </span>
                            ) : (
                              <span className={`text-lg ${probInfo.color}`} title={probInfo.label}>{probInfo.icon}</span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500 mt-1">#{player.ranking} - {player.country}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {isLineupEditMode && (
                <>
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
                      <h3 className="font-semibold text-sm sm:text-base">Noch nicht aufgestellt</h3>
                      <span className="text-xs text-zinc-500">{notInLineupPlayers.length} Spieler</span>
                    </div>

                    {notInLineupPlayers.length === 0 ? (
                      <div className="p-2 text-center rounded-lg bg-emerald-50 border border-emerald-200">
                        <p className="text-sm font-medium text-emerald-700">✓ Alle Spieler aufgestellt!</p>
                      </div>
                    ) : (
                      <div className="flex gap-2 overflow-x-auto pb-1 touch-pan-x">
                        {notInLineupPlayers.map((player) => {
                          const probInfo = getProbabilityIcon(player.appearance_probability);
                          const isWildcard = Boolean(player.is_wildcard);
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
                                  <span className="font-medium text-zinc-900 truncate text-sm">{formatLineupPlayerName(player)}</span>
                                </div>
                                {isWildcard ? (
                                  <span
                                    className="inline-flex items-center rounded-md bg-emerald-900 px-2 py-0.5 text-xs font-bold text-emerald-50"
                                    title="Wildcard"
                                  >
                                    WC
                                  </span>
                                ) : (
                                  <span className={`text-base ${probInfo.color}`} title={probInfo.label}>{probInfo.icon}</span>
                                )}
                              </div>
                              <p className="text-xs text-zinc-500 mt-1">#{player.ranking} - {player.country}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
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
              <span className="text-sm px-2 py-1 rounded-md bg-zinc-100 text-zinc-700 font-medium">
                Ranking #{historyPlayer.ranking}
              </span>
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
                      <div>
                        <span className="text-zinc-500">Fantasy Punkte:</span>{' '}
                        <span className={`font-semibold ${match.fantasy_points < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{match.fantasy_points}</span>
                      </div>
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
                  ) : teamInspection.lineupSlots.every((player) => !player) && teamInspection.reserveSlots.every((player) => !player) ? (
                    <p className="text-sm text-zinc-500">Dieses Team hat aktuell keine Aufstellung hinterlegt.</p>
                  ) : (
                    <div className="space-y-4">
                      <div className={`${activeTournament.status === 'on-going' ? 'bg-sky-500 border-sky-400' : 'bg-sky-300 border-sky-200'} rounded-2xl p-4 sm:p-6 shadow-md border`}>
                        {activeTournament.status === 'on-going' && (
                          <div className="mb-3 rounded-lg border border-white/35 bg-[#0f172acc] px-3 py-1.5">
                            <p className="text-xs font-semibold text-emerald-300">
                              Gesamtpunkte: {teamInspection.team.total_points_scored} Pkt | Rang im Turnier: {inspectedTeamRank ? `#${inspectedTeamRank}` : '-'}
                            </p>
                          </div>
                        )}
                        <div className="relative rounded-xl h-[360px] sm:h-[420px] border-2 border-white/50 overflow-hidden">
                          <div className="absolute inset-x-0 top-1/2 border-t-2 border-white/40" />
                          <div className="absolute top-0 bottom-0 left-[14%] border-l-2 border-white/40" />
                          <div className="absolute top-0 bottom-0 right-[14%] border-r-2 border-white/40" />
                          <div className="absolute left-[14%] right-[14%] top-[30%] border-t-2 border-white/40" />
                          <div className="absolute left-[14%] right-[14%] bottom-[30%] border-b-2 border-white/40" />
                          <div className="absolute left-1/2 -translate-x-1/2 top-[30%] bottom-[30%] border-l-2 border-white/40" />
                          <div className="absolute left-[14%] right-[14%] top-1/2 h-[2px] bg-white/40" />

                          {[0, 1, 2, 3, 4].map((slotIndex) => {
                            const player = teamInspection.lineupSlots[slotIndex] || null;
                            const roundState = player ? playerRoundStates.get(player.id) : undefined;
                            const roundLabel = roundState?.label || 'R1/R2';
                            const isOut = roundLabel === 'OUT';
                            const showLivePulse = Boolean(
                              activeTournament?.status === 'on-going'
                              && player
                              && (roundLabel === 'QF' || (roundState?.inTournament && !isOut))
                            );
                            const displayedPoints = player ? getDisplayedLineupPoints(player, slotIndex) : 0;
                            const highlightActive = Boolean(
                              player
                              && activeTournament?.status === 'on-going'
                              && (roundState ? roundState.inTournament : true)
                            );

                            return (
                              <div
                                key={slotIndex}
                                className={`absolute ${inspectionLineupPositions[slotIndex]} w-28 sm:w-32`}
                              >
                                <div className={`rounded-xl border-2 border-dashed border-white/70 bg-white/90 min-h-24 p-2 text-center ${showLivePulse ? 'animate-[pulse_4.2s_ease-in-out_infinite] shadow-[0_0_0_1px_rgba(74,222,128,0.12),0_0_5px_rgba(74,222,128,0.08)]' : ''}`}>
                                  {player ? (
                                    <button
                                      onClick={() => openPlayerHistory(player)}
                                      className="w-full text-center hover:opacity-85"
                                      title={formatLineupPlayerName(player)}
                                    >
                                      <img
                                        src={player.image_url || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/player-images/default.png`}
                                        alt={`${player.first_name} ${player.last_name}`}
                                        className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover mx-auto border-2 ${highlightActive ? 'border-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.25)]' : 'border-zinc-200'} ${isOut ? 'opacity-60' : ''}`}
                                      />
                                      <p className="text-xs font-semibold mt-1">{formatLineupPlayerName(player)}</p>
                                      <p className="text-xs text-zinc-500">#{player.ranking}</p>
                                      <p className={`${activeTournament.status === 'on-going' ? `mt-1 inline-flex items-center rounded-md px-1.5 py-0.5 text-[14px] leading-none font-extrabold border ${displayedPoints < 0 ? 'bg-red-100 text-red-700 border-red-200' : 'bg-emerald-950 text-lime-300 border-emerald-700'}` : `text-xs font-bold ${getPointsTextClass(displayedPoints)}`}`}>{displayedPoints} Pkt</p>
                                      <p className={`text-[11px] font-semibold ${roundLabel === 'OUT' ? 'text-red-600' : 'text-sky-700'}`}>{roundLabel}</p>
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

                      <div className="bg-pink-100 rounded-2xl p-4 shadow-md border border-pink-200">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div>
                            <h5 className="font-semibold text-pink-900">New Comer</h5>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {teamInspection.reserveSlots.map((player, reserveIndex) => {
                            const slotIndex = RESERVE_SLOT_START_INDEX + reserveIndex;
                            const roundState = player ? playerRoundStates.get(player.id) : undefined;
                            const roundLabel = roundState?.label || 'R1/R2';
                            const isOut = roundLabel === 'OUT';
                            const showLivePulse = Boolean(
                              activeTournament?.status === 'on-going'
                              && player
                              && (roundLabel === 'QF' || (roundState?.inTournament && !isOut))
                            );
                            const displayedPoints = player ? getDisplayedLineupPoints(player, slotIndex) : 0;
                            const highlightActive = Boolean(
                              player
                              && activeTournament?.status === 'on-going'
                              && (roundState ? roundState.inTournament : true)
                            );

                            return (
                              <div key={slotIndex} className={`rounded-xl border-2 border-dashed border-pink-300 bg-white/90 min-h-24 p-2 text-center ${showLivePulse ? 'animate-[pulse_4.2s_ease-in-out_infinite] shadow-[0_0_0_1px_rgba(74,222,128,0.11),0_0_5px_rgba(74,222,128,0.07)]' : ''}`}>
                                {player ? (
                                  <button
                                    onClick={() => openPlayerHistory(player)}
                                    className="w-full text-center hover:opacity-85"
                                    title={formatLineupPlayerName(player)}
                                  >
                                    <img
                                      src={player.image_url || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/player-images/default.png`}
                                      alt={`${player.first_name} ${player.last_name}`}
                                      className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover mx-auto border-2 ${highlightActive ? 'border-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.25)]' : 'border-pink-200'} ${isOut ? 'opacity-60' : ''}`}
                                    />
                                    <p className="text-xs font-semibold mt-1 text-pink-950">{formatLineupPlayerName(player)}</p>
                                    <p className="text-xs text-zinc-500">#{player.ranking}</p>
                                    <p className={`${activeTournament.status === 'on-going' ? `mt-1 inline-flex items-center rounded-md px-1.5 py-0.5 text-[14px] leading-none font-extrabold border ${displayedPoints < 0 ? 'bg-red-100 text-red-700 border-red-200' : 'bg-emerald-950 text-lime-300 border-emerald-700'}` : `text-xs font-bold ${getPointsTextClass(displayedPoints)}`}`}>{displayedPoints} Pkt</p>
                                    <p className={`text-[11px] font-semibold ${roundLabel === 'OUT' ? 'text-red-600' : 'text-pink-700'}`}>{roundLabel}</p>
                                  </button>
                                ) : (
                                  <div className="pt-5">
                                    <p className="text-xs font-semibold text-pink-700">Reserve {reserveIndex + 1}</p>
                                    <p className="text-xs text-pink-500 mt-1">Freier Slot</p>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
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
                        const isWildcard = Boolean(player.is_wildcard);
                        const isInLineup = [...teamInspection.lineupSlots, ...teamInspection.reserveSlots]
                          .some((lineupPlayer) => lineupPlayer?.id === player.id);
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
                                {isWildcard ? (
                                  <span
                                    className="inline-flex items-center rounded-md bg-emerald-900 px-2 py-0.5 text-xs font-bold text-emerald-50"
                                    title="Wildcard"
                                  >
                                    WC
                                  </span>
                                ) : (
                                  <span className={`text-lg ${probInfo.color}`} title={probInfo.label}>{probInfo.icon}</span>
                                )}
                                <span className={`text-sm font-semibold ${getPointsTextClass(playerTournamentPoints.get(player.id) || 0)}`}>
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
              Bei &quot;Direkt verkaufen&quot; erhältst Du sofort den Marktwert und der Spieler wird vom Markt aufgenommen.
              <br />
              Bei &quot;Anbieten&quot; können andere Manager Gebote abgeben, Du kannst aber auch jederzeit zum Marktwert verkaufen.
            </p>
          </div>
        </div>
      )}

      {activeBidAuction && (
        <div className="fixed inset-0 z-[60] overflow-hidden overscroll-none">
          <button
            type="button"
            aria-label="Bietfenster schließen"
            className="bottom-sheet-backdrop absolute inset-0 bg-black/40"
            onClick={closeBidSheet}
          />
          <div className="bottom-sheet-panel absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-white border-t border-zinc-200 shadow-[0_-10px_35px_rgba(0,0,0,0.25)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-5">
            <div className="mx-auto max-w-3xl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-zinc-500">Gebot abgeben</p>
                  <h3 className="text-lg font-bold text-zinc-900">
                    {getAuctionDisplayFirstName(activeBidAuction)} {getAuctionDisplayLastName(activeBidAuction)}
                  </h3>
                  <p className="text-sm text-zinc-600">
                    Marktwert: <span className="font-semibold text-emerald-700">{formatCurrency(activeBidAuction.market_value || 0)}</span>
                  </p>
                </div>
                <button
                  onClick={closeBidSheet}
                  className="inline-flex items-center gap-1.5 text-sm rounded-full border border-zinc-300 px-3 py-1.5 text-zinc-700 hover:bg-zinc-50"
                >
                  <X className="h-4 w-4" strokeWidth={2.2} />
                  Schließen
                </button>
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-medium text-zinc-700" htmlFor="bid-sheet-input">
                  Dein Gebot
                </label>
                <input
                  id="bid-sheet-input"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  autoComplete="off"
                  value={bidDraftAmount}
                  onChange={(e) => setBidDraftAmount(e.target.value)}
                  placeholder="z.B. 125000"
                  className="w-full rounded-xl border border-zinc-300 px-3 py-3 text-[16px] leading-6 focus:border-emerald-500 focus:outline-none"
                />

                {activeBidAuction.my_bid ? (
                  <p className="text-xs text-zinc-500">
                    Aktuelles Gebot: <span className="font-semibold text-zinc-700">{formatCurrency(activeBidAuction.my_bid)}</span>
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={submitBidFromSheet}
                    className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                  >
                    <Send className="h-4 w-4" strokeWidth={2.2} />
                    Gebot senden
                  </button>
                  {activeBidAuction.my_bid ? (
                    <button
                      onClick={async () => {
                        await withdrawBid(activeBidAuction.id);
                        closeBidSheet();
                      }}
                      className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                    >
                      Gebot zurückziehen
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {slotSelectionSheet && (
        <div className="fixed inset-0 z-[70]">
          <button
            type="button"
            aria-label="Spielerauswahl schließen"
            className="absolute inset-0 bg-black/40"
            onClick={() => setSlotSelectionSheet(null)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white border-t border-zinc-200 shadow-[0_-10px_35px_rgba(0,0,0,0.25)] max-h-[80vh] overflow-y-auto">
            <div className="p-4 sm:p-6">
              <div className="mx-auto max-w-3xl">
                <div className="mb-6 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-zinc-500">Spieler auswählen</p>
                    <h3 className="text-lg font-bold text-zinc-900">
                      Slot {(slotSelectionSheet?.slotIndex ?? 0) + 1}
                      {slotSelectionSheet && isReserveSlot(slotSelectionSheet.slotIndex) && (
                        <span className="ml-2 text-sm font-normal text-zinc-600">(Reserve - Ranking &gt; {RESERVE_ELIGIBLE_RANKING_THRESHOLD})</span>
                      )}
                    </h3>
                  </div>
                  <button
                    onClick={() => setSlotSelectionSheet(null)}
                    className="inline-flex items-center gap-1.5 text-sm rounded-full border border-zinc-300 px-3 py-1.5 text-zinc-700 hover:bg-zinc-50"
                  >
                    <X className="h-4 w-4" strokeWidth={2.2} />
                    Schließen
                  </button>
                </div>

                {slotSelectionSheet && (() => {
                  const slotIndex = slotSelectionSheet.slotIndex;
                  const validPlayers = getValidPlayersForSlot(slotIndex);
                  const isReserveSlotType = isReserveSlot(slotIndex);
                  
                  return (
                    <div>
                      {validPlayers.length === 0 ? (
                        <div className="p-6 text-center rounded-2xl bg-zinc-50 border border-zinc-200">
                          <p className="text-zinc-600">
                            {isReserveSlotType
                              ? `Keine Spieler mit Ranking > ${RESERVE_ELIGIBLE_RANKING_THRESHOLD} verfügbar`
                              : 'Keine Spieler verfügbar'}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {validPlayers.map((player) => {
                            const probInfo = getProbabilityIcon(player.appearance_probability);
                            const isWildcard = Boolean(player.is_wildcard);
                            const playerPoints = playerTournamentPoints.get(player.id) || 0;
                            const marketValue = playerMarketValues.get(player.id) || 0;
                            const isActivePlayer = player.appearance_probability !== 'Ausgeschlossen';
                            
                            return (
                              <button
                                key={player.id}
                                onClick={() => applyPlayerToSlot(slotIndex, player)}
                                className="w-full text-left p-3 rounded-xl border border-zinc-200 bg-white hover:border-emerald-300 hover:bg-emerald-50 transition-colors duration-150"
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`rounded-full p-[2px] flex-shrink-0 ${isActivePlayer ? 'bg-emerald-500' : 'bg-zinc-300'}`}>
                                    <img
                                      src={player.image_url || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/player-images/default.png`}
                                      alt={`${player.first_name} ${player.last_name}`}
                                      className="w-12 h-12 rounded-full object-cover bg-zinc-100"
                                    />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="font-semibold text-zinc-900 truncate">
                                        {player.first_name} {player.last_name}
                                      </p>
                                      {isWildcard && (
                                        <span className="inline-flex items-center rounded-md bg-emerald-900 px-1.5 py-0.5 text-[10px] font-bold text-emerald-50 flex-shrink-0">
                                          WC
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                                      <span>#{player.ranking}</span>
                                      <span className={probInfo.color} title={probInfo.label}>{probInfo.icon}</span>
                                      <span className="truncate">{player.country}</span>
                                    </div>
                                  </div>
                                  <div className="flex-shrink-0 text-right">
                                    <p className="text-sm font-bold">{formatCurrency(marketValue)}</p>
                                    <p className={`text-sm font-semibold ${getPointsTextClass(playerPoints)}`}>{playerPoints} Pkt</p>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}