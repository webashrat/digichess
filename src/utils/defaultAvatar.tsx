// Generate a WhatsApp-style default avatar with initials and color

const colors = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52BE80',
  '#E74C3C', '#3498DB', '#9B59B6', '#1ABC9C', '#F39C12',
  '#E67E22', '#95A5A6', '#34495E', '#16A085', '#27AE60'
];

const getInitials = (username: string, firstName?: string, lastName?: string): string => {
  if (firstName && lastName) {
    return (firstName[0] + lastName[0]).toUpperCase();
  }
  if (firstName) {
    return firstName.substring(0, 2).toUpperCase();
  }
  // Use first two characters of username
  return username.substring(0, 2).toUpperCase();
};

const getColor = (username: string): string => {
  // Generate a consistent color based on username
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

interface DefaultAvatarProps {
  username: string;
  firstName?: string;
  lastName?: string;
  size?: number;
  fontSize?: number;
}

export const DefaultAvatar = ({ username, firstName, lastName, size = 40, fontSize }: DefaultAvatarProps) => {
  const initials = getInitials(username, firstName, lastName);
  const color = getColor(username);
  const textSize = fontSize || Math.max(12, size * 0.4);

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#FFFFFF',
        fontWeight: 600,
        fontSize: textSize,
        flexShrink: 0
      }}
    >
      {initials}
    </div>
  );
};

export const getDefaultAvatarStyle = (
  username: string,
  firstName?: string,
  lastName?: string,
  size: number = 40
): React.CSSProperties => {
  const initials = getInitials(username, firstName, lastName);
  const color = getColor(username);
  const fontSize = Math.max(12, size * 0.4);

  return {
    width: size,
    height: size,
    borderRadius: '50%',
    backgroundColor: color,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#FFFFFF',
    fontWeight: 600,
    fontSize: fontSize,
    flexShrink: 0
  };
};

export const getDefaultAvatarContent = (username: string, firstName?: string, lastName?: string): string => {
  return getInitials(username, firstName, lastName);
};







