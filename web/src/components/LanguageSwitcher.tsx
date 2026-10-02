import { MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import { useSetLocale } from 'react-admin';
import LanguageIcon from '@mui/icons-material/Language';

export const LanguageSwitcher = () => {
  const setLocale = useSetLocale();
  return (
    <MenuItem onClick={() => setLocale('en-US')}>
      <ListItemIcon><LanguageIcon fontSize="small" /></ListItemIcon>
      <ListItemText>English</ListItemText>
    </MenuItem>
  );
};
