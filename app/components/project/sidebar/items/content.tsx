import { Baby, Clapperboard, ImagePlay, Star } from 'lucide-react';
import { NavItem } from '.';

const classes = 'text-muted-foreground';
const baseUrl = '/content-management';

export const content: NavItem = {
  title: 'Content Management',
  url: '#',
  icon: ImagePlay,
  canAccess: false,
  items: [
    {
      title: 'Rate Content',
      url: baseUrl + '/parental-ratings',
      icon: <Baby className={classes} />,
      canAccess: true
    },
    {
      title: 'Manage Ratings',
      url: baseUrl + '/manage-ratings',
      icon: <Star className={classes} />,
      canAccess: true
    },
    {
      title: 'Watchlist Settings',
      url: baseUrl + '/watchlist-settings',
      icon: <Clapperboard className={classes} />,
      canAccess: true
    }
  ]
};
