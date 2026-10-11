import { Baby, Clapperboard, ImagePlay, Star, Tag, Tags } from 'lucide-react';
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
      title: 'Tag Content',
      url: baseUrl + '/tag-content',
      icon: <Tag className={classes} />,
      canAccess: true
    },
    {
      title: 'Manage Tags',
      url: baseUrl + '/manage-tags',
      icon: <Tags className={classes} />,
      canAccess: true
    },
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
