import { Mode, UserLookup } from '../api/types';
import { getDefaultAvatarStyle, getDefaultAvatarContent } from '../utils/defaultAvatar';

interface Props {
  user: UserLookup;
  rating?: number;
  mode?: Mode;
  rightText?: string;
  isActive?: boolean;
  isMyTurn?: boolean;
}

const countryFlag = (code?: string) => {
  if (!code) return '🌍';
  if (code.toUpperCase() === 'INTERNATIONAL') return '🌍';
  try {
    const cc = code.trim().toUpperCase();
    if (cc.length === 2) {
      const codePoints = cc.split('').map((c) => 0x1f1a5 + c.charCodeAt(0));
      return String.fromCodePoint(...codePoints);
    }
  } catch {
    return '🌍';
  }
  return '🌍';
};

export default function IdentityStrip({ user, rating, mode, rightText, isActive, isMyTurn }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {/* Profile picture */}
      <a
        href={`/profile/${user.username}`}
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '2px solid ' + (isActive && isMyTurn ? 'var(--accent)' : 'var(--border)'),
          backgroundImage: user.profile_pic ? `url(${user.profile_pic})` : undefined,
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
          ...(user.profile_pic ? {} : getDefaultAvatarStyle(user.username, user.first_name, user.last_name, 40))
        }}
      >
        {!user.profile_pic && (
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
            href={`/profile/${user.username}`}
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
          <span style={{ fontSize: 14, flexShrink: 0 }}>{countryFlag(user.country)}</span>
          {rating !== undefined && rating !== null && (
            <span style={{ 
              fontSize: 14, 
              fontWeight: 600, 
              color: 'var(--text)',
              flexShrink: 0,
              marginLeft: 4
            }}>
              {rating}
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
