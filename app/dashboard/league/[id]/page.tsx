'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useParams } from 'next/navigation';

interface FantasyTeam {
  id: string;
  name: string;
  total_points_scored: number;
  user_id: string;
}

interface Auction {
  id: string;
  player_id: string;
  highest_bid: number;
  end_time: string;
  player: { first_name: string; last_name: string; ranking: number; country: string };
}

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  ranking: number;
  country: string;
}

interface Tournament {
  id: string;
  name: string;
  start_date: string;
}

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

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('Current user:', user);
      console.log('League ID from params:', leagueId);
      setUser(user);
      if (user) {
        const { data: team, error } = await supabase
          .from('fantasy_teams')
          .select('id')
          .eq('user_id', user.id)
          .eq('league_id', leagueId)
          .single();
        console.log('Team query result:', team, 'error:', error);
        setMyTeamId(team?.id || '');
      }
    };
    getUser();
  }, [leagueId]);

  useEffect(() => {
    if (user) {
      loadLeaderboard();
      loadAuctions();
      loadTournaments();
      if (myTeamId) {
        loadMyTeam();
      }
    }
  }, [user, leagueId, myTeamId]);

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

  const loadLeaderboard = async () => {
    const { data } = await supabase
      .from('fantasy_teams')
      .select('id, name, total_points_scored, user_id')
      .eq('league_id', leagueId)
      .order('total_points_scored', { ascending: false });
    setLeaderboard(data || []);
  };

const loadAuctions = async () => {
  const { data } = await supabase
    .from('market_auctions')
    .select('id, player_id, highest_bid, end_time, player:players(first_name, last_name, ranking, country)')
    .eq('league_id', leagueId)
    .gt('end_time', new Date().toISOString());

  if (data) {
    // Hier ist der Trick: Wir mappen durch die Daten und ziehen den Player aus dem Array
    const formattedData = data.map((auction: any) => ({
      ...auction,
      player: Array.isArray(auction.player) ? auction.player[0] : auction.player
    }));
    setAuctions(formattedData);
  }
};

  const loadMyTeam = async () => {
    if (!myTeamId) {
      console.log('No myTeamId');
      return;
    }
    console.log('Loading team for myTeamId:', myTeamId);
    // First get the player IDs from team_players
    const { data: teamPlayers, error: tpError } = await supabase
      .from('team_players')
      .select('player_id')
      .eq('team_id', myTeamId);

    console.log('teamPlayers:', teamPlayers, 'error:', tpError);

    if (teamPlayers && teamPlayers.length > 0) {
      const playerIds = teamPlayers.map(tp => tp.player_id);
      console.log('playerIds:', playerIds);
      // Then get the player details
      const { data: players, error: pError } = await supabase
        .from('players')
        .select('id, first_name, last_name, ranking, country')
        .in('id', playerIds);
      console.log('players:', players, 'error:', pError);
      setMyTeam(players || []);
    } else {
      console.log('No teamPlayers found');
      setMyTeam([]);
    }
  };

  const loadTournaments = async () => {
    const { data } = await supabase
      .from('tournaments')
      .select('id, name, start_date')
      .gt('start_date', new Date().toISOString());
    setTournaments(data || []);
  };

  const placeBid = async (auctionId: string, bidAmount: number) => {
    if (!myTeamId) return;
    const auction = auctions.find(a => a.id === auctionId);
    if (!auction || bidAmount <= auction.highest_bid) return alert('Bid too low');
    const { data: team } = await supabase.from('fantasy_teams').select('budget').eq('id', myTeamId).single();
    // Fehlerprüfung hinzufügen:
    if (!team) {
    console.error("Team nicht gefunden");
    return;
    }

if (bidAmount > team.budget) return alert('Not enough budget');
    if (bidAmount > team.budget) return alert('Not enough budget');
    await supabase.from('market_auctions').update({ highest_bid: bidAmount, highest_bidder_id: myTeamId }).eq('id', auctionId);
    await supabase.from('fantasy_teams').update({ budget: team.budget - bidAmount }).eq('id', myTeamId);
  };

  const selectLineup = async (tournamentId: string, selectedPlayers: string[]) => {
    if (selectedPlayers.length > 3) return alert('Max 3 players');
    // Delete existing
    await supabase.from('tournament_lineups').delete().eq('tournament_id', tournamentId).eq('team_id', myTeamId);
    // Insert new
    const inserts = selectedPlayers.map(playerId => ({
      tournament_id: tournamentId,
      team_id: myTeamId,
      player_id: playerId
    }));
    await supabase.from('tournament_lineups').insert(inserts);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Liga</h1>

      {/* tabs */}
      <nav className="flex space-x-6 mb-8 border-b border-zinc-200">
        {['leaderboard','auctions','myteam','tournaments'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-2 text-sm font-medium transition-colors ${activeTab === tab ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-zinc-600 hover:text-zinc-900'}`}
          >
            {tab === 'leaderboard' ? 'Rangliste' : tab === 'auctions' ? 'Transfermarkt' : tab === 'myteam' ? 'Mein Team' : 'Turniere & Aufstellung'}
          </button>
        ))}
      </nav>

      {activeTab === 'leaderboard' && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Rangliste</h2>
          <ul className="space-y-2">
            {leaderboard.map(team => (
              <li
                key={team.id}
                className="flex justify-between items-center p-3 bg-white rounded-xl shadow-sm border border-zinc-100"
              >
                <span className="font-medium">{team.name}</span>
                <span className="text-zinc-500">{team.total_points_scored} Punkte</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeTab === 'auctions' && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Transfermarkt</h2>
          <ul className="space-y-4">
            {auctions.map(auction => (
              <li
                key={auction.id}
                className="p-4 bg-white rounded-xl shadow-sm border border-zinc-100"
              >
                <div className="flex justify-between mb-2">
                  <span className="font-medium">{auction.player.first_name} {auction.player.last_name}</span>
                  <span className="text-zinc-500">Ranking: {auction.player.ranking}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Höchstgebot: {auction.highest_bid}</span>
                  <span className="text-zinc-500">Endet: {new Date(auction.end_time).toLocaleString()}</span>
                </div>
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
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeTab === 'myteam' && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Mein Team</h2>
          <ul className="space-y-2">
            {myTeam.map(player => (
              <li
                key={player.id}
                className="flex justify-between p-3 bg-white rounded-xl shadow-sm border border-zinc-100"
              >
                <span>{player.first_name} {player.last_name}</span>
                <span className="text-zinc-500">#{player.ranking} – {player.country}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeTab === 'tournaments' && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Turniere & Aufstellung</h2>
          <ul className="space-y-4">
            {tournaments.map(tournament => (
              <li
                key={tournament.id}
                className="p-4 bg-white rounded-xl shadow-sm border border-zinc-100"
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">{tournament.name}</span>
                  <span className="text-zinc-500">{new Date(tournament.start_date).toLocaleDateString()}</span>
                </div>
                <button
                  onClick={() => {
                    const selected = myTeam.slice(0, 3).map(p => p.id);
                    selectLineup(tournament.id, selected);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded text-sm"
                >
                  Aufstellung wählen
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}