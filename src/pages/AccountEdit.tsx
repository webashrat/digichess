import { FormEvent, useEffect, useState } from 'react';
import { fetchMe, updateMe } from '../api/account';
import { UserDetail } from '../api/types';
import { CountrySelect } from '../components/CountrySelect';
import { socialPlatforms, detectPlatform } from '../utils/socialPlatforms';
import { getDefaultAvatarStyle, getDefaultAvatarContent } from '../utils/defaultAvatar';

export default function AccountEdit() {
  const [me, setMe] = useState<UserDetail | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);

  useEffect(() => {
    fetchMe()
      .then((data) => {
        setMe(data);
        setUploadPreview(data.profile_pic || null);
      })
      .catch(() => setError('Unable to load profile'));
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!me) return;
    setError('');
    setMsg('');
    updateMe({
      email: me.email,
      username: me.username,
      first_name: me.first_name,
      last_name: me.last_name,
      bio: me.bio,
      country: me.country,
      nickname: me.nickname,
      profile_pic: me.profile_pic,
      social_links: me.social_links,
      show_friends_public: me.show_friends_public
    })
      .then((data) => {
        setMe(data);
        setMsg('Updated');
      })
      .catch((err) => {
        const data = err.response?.data;
        if (data?.detail) setError(data.detail);
        else if (typeof data === 'string') setError(data);
        else setError('Update failed');
      });
  };

  const updateField = (field: keyof UserDetail, value: any) => {
    setMe((m) => (m ? { ...m, [field]: value } : m));
  };

  const updateLink = (idx: number, key: 'label' | 'url', value: string) => {
    setMe((m) => {
      if (!m) return m;
      const links = [...(m.social_links || [])];
      links[idx] = { ...links[idx], [key]: value };
      return { ...m, social_links: links };
    });
  };

  const addLink = () => {
    setMe((m) => (m ? { ...m, social_links: [...(m.social_links || []), { label: '', url: '' }] } : m));
  };

  const removeLink = (idx: number) => {
    setMe((m) => {
      if (!m) return m;
      const links = [...(m.social_links || [])];
      links.splice(idx, 1);
      return { ...m, social_links: links };
    });
  };

  const handlePicUrl = (url: string) => {
    updateField('profile_pic', url);
    setUploadPreview(url);
  };

  const handlePicFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.includes('jpeg') && !file.type.includes('png') && !file.name.match(/\.(jpg|jpeg|png)$/i)) {
      setError('Only JPG or PNG images are allowed.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setUploadPreview(result);
      updateField('profile_pic', result);
    };
    reader.readAsDataURL(file);
  };

  if (!me && !error) {
    return (
      <div className="layout">
        <div className="card">Loading...</div>
      </div>
    );
  }

  return (
    <div className="layout stack-lg">
      <div className="page-header">
        <div>
          <h1 className="page-title">Account settings</h1>
          <p className="page-subtitle">Update your profile, socials, and privacy.</p>
        </div>
      </div>
      <form
        className="card stack"
        style={{ maxWidth: 640, width: '100%', margin: '0 auto', overflowY: 'auto', maxHeight: 'calc(100vh - 240px)' }}
        onSubmit={submit}
      >
        <label>
          <div>Email</div>
          <input type="email" value={me?.email || ''} onChange={(e) => updateField('email', e.target.value)} required />
        </label>
        <label>
          <div>Username</div>
          <input value={me?.username || ''} onChange={(e) => updateField('username', e.target.value)} required />
        </label>
        <label>
          <div>Profile picture (JPG/PNG)</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                border: '1px solid var(--border)',
                backgroundImage: uploadPreview || me?.profile_pic ? `url(${uploadPreview || me?.profile_pic})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                ...(uploadPreview || me?.profile_pic ? {} : getDefaultAvatarStyle(me?.username || 'User', me?.first_name, me?.last_name, 64))
              }}
            >
              {!(uploadPreview || me?.profile_pic) && me?.username && (
                <span style={{ color: '#FFFFFF', fontWeight: 600, fontSize: 24 }}>
                  {getDefaultAvatarContent(me.username, me.first_name, me.last_name)}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                type="url"
                placeholder="https://example.com/avatar.png"
                value={me?.profile_pic || ''}
                onChange={(e) => handlePicUrl(e.target.value)}
              />
              <input type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" onChange={(e) => handlePicFile(e.target.files?.[0] || null)} />
            </div>
          </div>
        </label>
        <label>
          <div>First name</div>
          <input value={me?.first_name || ''} onChange={(e) => updateField('first_name', e.target.value)} />
        </label>
        <label>
          <div>Last name</div>
          <input value={me?.last_name || ''} onChange={(e) => updateField('last_name', e.target.value)} />
        </label>
        <label>
          <div>Country</div>
          <CountrySelect value={me?.country} onChange={(v) => updateField('country', v)} />
        </label>
        <label>
          <div>Nickname</div>
          <input value={me?.nickname || ''} onChange={(e) => updateField('nickname', e.target.value)} />
        </label>
        <label>
          <div>Bio</div>
          <textarea value={me?.bio || ''} onChange={(e) => updateField('bio', e.target.value)} />
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="section-title">Social links</div>
          {(me?.social_links || []).map((link, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 8, alignItems: 'center' }}>
              <select
                value={link.label || detectPlatform(link.url || '')}
                onChange={(e) => updateLink(idx, 'label', e.target.value)}
              >
                {socialPlatforms.map((p) => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
              <input
                placeholder="https://example.com/you"
                value={link.url || ''}
                onChange={(e) => updateLink(idx, 'url', e.target.value)}
              />
              <button className="btn btn-ghost" type="button" onClick={() => removeLink(idx)}>Remove</button>
            </div>
          ))}
          <button className="btn btn-ghost" type="button" onClick={addLink}>+ Add</button>
          {(me?.social_links || []).length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {me?.social_links?.map((link, idx) => {
                const platform = detectPlatform(link.url || '') || link.label || 'Link';
                const icon = socialPlatforms.find((p) => p.name === platform)?.icon;
                return (
                  <a
                    key={`${platform}-${idx}`}
                    className="pill"
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    {icon ? <img src={icon} alt={platform} style={{ width: 16, height: 16 }} /> : <span>🔗</span>}
                    <span>{platform}</span>
                  </a>
                );
              })}
            </div>
          )}
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={!!me?.show_friends_public}
            onChange={(e) => updateField('show_friends_public', e.target.checked)}
            style={{ width: 'auto' }}
          />
          <span>Show friends publicly</span>
        </label>
        {msg && <div className="form-message form-message--success">{msg}</div>}
        {error && <div className="form-message form-message--error">{error}</div>}
        <button className="btn btn-primary" type="submit" style={{ fontSize: 16, padding: '14px 28px', fontWeight: 700 }}>
          Save Changes
        </button>
      </form>
    </div>
  );
}
