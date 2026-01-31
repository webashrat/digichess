import { Mode, UserLookup } from '../api/types';
import { getDefaultAvatarStyle, getDefaultAvatarContent } from '../utils/defaultAvatar';
import FlagIcon from './FlagIcon';

interface Props {
  user: UserLookup;
  rating?: number;
  ratingChange?: number; // Rating change after game (positive for win, negative for loss)
  mode?: Mode;
  rightText?: string;
  isActive?: boolean;
  isMyTurn?: boolean;
}

export default function IdentityStrip({ user, rating, ratingChange, mode, rightText, isActive, isMyTurn }: Props) {
  // Check if this is DIGI bot and use DIGIBOT.jpg
  const isDigiBot = (user.first_name === 'DIGI' || user.username === 'DIGI' || user.username?.toUpperCase() === 'DIGI');
  const profilePic = isDigiBot ? '/DIGIBOT.jpg' : (user.profile_pic || undefined);
  
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {/* Profile picture */}
      <a
        href={`#/profile/${user.username}`}
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '2px solid ' + (isActive && isMyTurn ? 'var(--accent)' : 'var(--border)'),
          backgroundImage: profilePic ? `url(${profilePic})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          flexShrink: 0,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          textDecoration: 'none',
          overflow: 'hidden',
          ...(profilePic ? {} : getDefaultAvatarStyle(user.username, user.first_name, user.last_name, 40))
        }}
      >
        {!profilePic && (
          <span style={{ color: '#FFFFFF', fontWeight: 600, fontSize: 16 }}>
            {getDefaultAvatarContent(user.username, user.first_name, user.last_name)}
          </span>
        )}
        {/* Connection indicator */}
        {isActive !== undefined && (
          <div
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: isActive ? '#4caf50' : '#f44336',
              border: '2px solid var(--bg)',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.1)'
            }}
            title={isActive ? 'Online' : 'Offline'}
          />
        )}
      </a>
      
      {/* Username and rating */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <a
            href={`#/profile/${user.username}`}
            style={{ 
              fontWeight: 600, 
              color: 'var(--text)', 
              textDecoration: 'none',
              fontSize: 15,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '150px'
            }}
            title={user.username}
          >
            {user.username}
          </a>
          <FlagIcon code={user.country} size={18} />
          {rating !== undefined && rating !== null && (
            <span style={{ 
              fontSize: 14, 
              fontWeight: 600, 
              color: 'var(--text)',
              flexShrink: 0,
              marginLeft: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}>
              <span>{rating}</span>
              {ratingChange !== undefined && ratingChange !== null && ratingChange !== 0 && (
                <span style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: ratingChange > 0 ? '#4caf50' : '#f44336',
                  marginLeft: 2
                }}>
                  {ratingChange > 0 ? '+' : ''}{ratingChange}
                </span>
              )}
            </span>
          )}
        </div>
        {mode && (
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'capitalize' }}>
            {mode}
          </div>
        )}
      </div>
    </div>
  );
}
