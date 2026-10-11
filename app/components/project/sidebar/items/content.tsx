import { ImagePlay, Star } from 'lucide-react';
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
      title: 'Manage Ratings',
      url: baseUrl + '/manage-ratings',
      icon: <Star className={classes} />,
      canAccess: true
    }
  ]
};

