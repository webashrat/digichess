export type Mode = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'custom';
export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*';

export interface UserLookup {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  country: string;
  profile_pic: string | null;
  is_bot?: boolean;
}

export interface UserDetail extends UserLookup {
  email: string;
  nickname?: string;
  bio?: string;
  social_links: { label: string; url: string }[];
  rating_bullet: number;
  rating_blitz: number;
  rating_rapid: number;
  rating_classical: number;
  rating_digiquiz?: number; // Backend sends rating_digiquiz
  digiquiz_rating?: number; // Alias for compatibility
  digiquiz_correct: number;
  digiquiz_wrong: number;
  is_online: boolean;
  is_playing: boolean;
  spectate_game_id: number | null;
  show_friends_public?: boolean;
  stats?: UserStats;
}

export interface GameSummary {
  id: number;
  creator?: UserLookup;
  white: UserLookup;
  black: UserLookup;
  mode: Mode;
  rated: boolean;
  time_control: string;
  status: string;
  spectators: number;
  created_at?: string;
  started_at?: string;
  finished_at?: string;
  result?: GameResult;
  moves?: string;
  current_fen?: string;
  legal_moves?: string[];
  draw_offer_by?: number | null;
  rematch_requested_by?: number | null;
  first_move_deadline?: number | null;
  first_move_color?: 'white' | 'black' | null;
  move_count?: number;
  tournament_id?: number | null;
}

export interface GameAnalysis {
  legal_moves: string[];
  is_check: boolean;
  is_checkmate: boolean;
  is_stalemate: boolean;
  can_claim_threefold: boolean;
  can_claim_fifty: boolean;
  castling_rights: {
    white_king: boolean;
    white_queen: boolean;
    black_king: boolean;
    black_queen: boolean;
  };
}

export interface EngineInfo {
  best_move?: string | null;
  score?: number | null;
  mate?: number | null;
  error?: string | null;
}

export interface ModeStats {
  games_played: number;
  wins: number;
  win_percentage: number;
  games_as_white: number;
  games_as_black: number;
  win_percentage_white: number;
  win_percentage_black: number;
  draws: number;
}

export interface UserStats {
  total: {
    games_played: number;
    wins: number;
    win_percentage: number;
    games_as_white: number;
    games_as_black: number;
    win_percentage_white: number;
    win_percentage_black: number;
    draws: number;
    modes: {
      bullet: ModeStats;
      blitz: ModeStats;
      rapid: ModeStats;
      classical: ModeStats;
      custom: ModeStats;
    };
  };
}

export interface LeaderboardRow {
  username: string;
  country: string;
  rating?: number;
  rating_digiquiz?: number;
  digiquiz_correct?: number;
  digiquiz_wrong?: number;
  rd?: number;
  wins?: number;
}

export interface OTPState {
  email: string;
  username?: string;
  message?: string;
}

export interface AccountListItem {
  id: number;
  first_name: string;
  last_name: string;
  username: string;
  country: string;
  profile_pic: string | null;
  rating_blitz?: number;
  is_bot?: boolean;
  is_online?: boolean;
}

export interface GameCreatePayload {
  mode: Mode;
  white_time_seconds?: number;
  black_time_seconds?: number;
  white_increment_seconds?: number;
  black_increment_seconds?: number;
  opponent_id?: number | null;
  preferred_color?: 'auto' | 'white' | 'black';
  rated?: boolean;
}
