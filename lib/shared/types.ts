// Types shared by API routes and client components. No runtime imports.

export type ServerDto = {
  id: string;
  name: string;
  base_url: string;
  jf_server_id: string | null;
};

export type GroupDto = {
  id: string;
  server_id: string;
  name: string;
  max_rating: number | null;
  allowed_tags: string[];
  blocked_tags: string[];
  allow_downloads: boolean;
  allow_live_tv: boolean;
  max_sessions: number;
  library_ids: string[];
  member_count: number;
};

export type LibraryWithGroups = {
  id: string;
  name: string;
  groups: string[];
};

export type UserRowDto = {
  Id: string;
  Name: string;
  LastActivityDate?: string;
  LastLoginDate?: string;
  Group: string | null;
  Policy: {
    MaxParentalRating: number | null;
    IsDisabled: boolean;
    EnableLiveTvAccess: boolean;
    EnableContentDownloading: boolean;
    IsAdministrator: boolean;
  };
};

export type CreateUserResponse = {
  User: { Id: string; Name: string };
  Pw: string;
  warnings: string[];
};
