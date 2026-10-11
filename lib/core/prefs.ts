import type { JellyfinClient } from './jellyfin.ts';

export const MOBILE_PREFS = {
  SortBy: 'SortName',
  RememberIndexing: false,
  PrimaryImageHeight: 250,
  PrimaryImageWidth: 250,
  CustomPrefs: {
    homesection0: 'resume',
    homesection1: 'smalllibrarytiles',
    homesection2: 'nextup',
    homesection3: 'latestmedia',
    homesection4: 'none',
    homesection5: 'none',
    homesection6: 'none',
    homesection7: 'none',
    homesection8: 'none',
    homesection9: 'none',
    homesection10: 'none',
    chromecastVersion: 'stable',
    skipForwardLength: '30000',
    skipBackLength: '10000',
    enableNextVideoInfoOverlay: 'False',
    tvhome: null,
    dashboardTheme: null
  } as Record<string, string | null>,
  ScrollDirection: 'Horizontal',
  ShowBackdrop: true,
  RememberSorting: false,
  SortOrder: 'Ascending',
  ShowSidebar: false,
  Client: 'emby'
};

export const TV_PREFS = {
  SortBy: 'SortName',
  RememberIndexing: false,
  PrimaryImageHeight: 250,
  PrimaryImageWidth: 250,
  CustomPrefs: {
    chromecastVersion: 'stable',
    skipForwardLength: '30000',
    skipBackLength: '10000',
    enableNextVideoInfoOverlay: 'False',
    tvhome: null,
    dashboardTheme: null,
    FilterFavoritesOnly: 'false',
    FilterUnwatchedOnly: 'false',
    GridDirection: 'VERTICAL',
    PosterSize: 'LARGE',
    SmartScreen: 'false',
    SortBy: 'SORT_NAME',
    SortOrder: 'ASCENDING'
  },
  ScrollDirection: 'Horizontal',
  ShowBackdrop: true,
  RememberSorting: false,
  SortOrder: 'Ascending',
  ShowSidebar: false,
  Client: 'jellyfin-androidtv'
};

export function userConfiguration(subtitleLanguage: string) {
  return {
    PlayDefaultAudioTrack: true,
    SubtitleLanguagePreference: subtitleLanguage,
    DisplayMissingEpisodes: false,
    GroupedFolders: [] as string[],
    SubtitleMode: 'Default',
    DisplayCollectionsView: false,
    EnableLocalPassword: false,
    MyMediaExcludes: [] as string[],
    HidePlayedInLatest: true,
    RememberAudioSelections: true,
    RememberSubtitleSelections: true,
    EnableNextEpisodeAutoPlay: true
  };
}

/**
 * Cosmetic defaults for ONE new user: subtitle preference, home layout, library sort order, TV layout.
 * Never throws; returns warnings so a cosmetic failure does not discard a correctly configured account.
 */
export async function applyNewUserPrefs(
  client: JellyfinClient,
  userId: string,
  libraryIds: string[],
  subtitleLanguage: string
): Promise<string[]> {
  const warnings: string[] = [];
  const uid = encodeURIComponent(userId);
  const post = async (label: string, path: string, body: unknown) => {
    try {
      const res = await client.request('POST', path, body);
      if (!res.ok) warnings.push(`${label} failed (HTTP ${res.status})`);
    } catch (error) {
      warnings.push(`${label} failed (${(error as Error).message})`);
    }
  };

  await post('Subtitle preference', `/Users/${uid}/Configuration`, userConfiguration(subtitleLanguage));

  const customPrefs: Record<string, string | null> = { ...MOBILE_PREFS.CustomPrefs };
  for (const id of libraryIds) {
    customPrefs[`items-${id}-Folder-sortby`] = 'ProductionYear,PremiereDate,SortName';
    customPrefs[`items-${id}-Folder-sortorder`] = 'Descending';
  }
  await post('Home layout', `/DisplayPreferences/usersettings?userId=${uid}&client=emby`, { ...MOBILE_PREFS, CustomPrefs: customPrefs });

  try {
    const res = await client.request('GET', `/UserViews?userId=${uid}&includeHidden=false`);
    if (res.ok) {
      const data = (await res.json()) as { Items?: Array<{ UserData?: { Key?: string } }> };
      const keys = (data.Items ?? []).map((i) => i.UserData?.Key).filter((k): k is string => !!k);
      for (const key of keys) {
        await post('TV layout', `/DisplayPreferences/${encodeURIComponent(key)}?userId=${uid}&client=jellyfin-androidtv`, TV_PREFS);
      }
    } else {
      warnings.push(`TV layout skipped (HTTP ${res.status})`);
    }
  } catch (error) {
    warnings.push(`TV layout skipped (${(error as Error).message})`);
  }
  return warnings;
}
