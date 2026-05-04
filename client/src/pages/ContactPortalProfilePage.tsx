import { useState } from 'react';
import { useContactAuth } from '@/context/ContactAuthContext';
import { contactPortalAuthApi } from '@/services/api/contactPortalAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const ContactPortalProfilePage = () => {
  const { contact, isGuest, loginWithProfile, clearError } = useContactAuth();
  const [name, setName] = useState(contact?.name ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);
    setError(null);
    clearError();
    try {
      const res = await fetch('/api/portal/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim() || undefined,
          email: email.trim() || undefined,
          currentPassword: newPassword ? currentPassword || undefined : undefined,
          newPassword: newPassword || undefined,
        }),
        credentials: 'include',
      });
      if (!res.ok) {
        let messageText = 'Failed to update profile';
        try {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const problem = await res.json();
            if (typeof problem.detail === 'string' && problem.detail.trim().length > 0) {
              messageText = problem.detail;
            } else if (typeof problem.title === 'string' && problem.title.trim().length > 0) {
              messageText = problem.title;
            }
          } else {
            const text = await res.text();
            if (text && text.length < 200) {
              messageText = text;
            }
          }
        } catch {
          // ignore
        }
        throw new Error(messageText);
      }
      const dto = await res.json();
      const updatedProfile = await contactPortalAuthApi.getProfile();
      if (updatedProfile) {
        loginWithProfile(updatedProfile);
      }
      setMessage('Profile updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (e: any) {
      setError(e.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="space-y-4 max-w-xl">
      <header>
        <h2 className="text-lg font-semibold text-foreground">Profile</h2>
        <p className="text-xs text-muted-foreground">
          {isGuest
            ? 'You are currently logged in as a guest. Register to save your details and manage your profile.'
            : 'Update your basic details and optionally change your password.'}
        </p>
      </header>

      {isGuest ? (
        <div className="rounded-xl border border-dashed border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/10 p-4 text-xs space-y-2">
          <p className="text-muted-foreground">
            Guest sessions do not have a persistent profile. To update your details and create a
            secure login, please register for a contact account.
          </p>
          <Button
            type="button"
            className="h-9 rounded-lg px-3 text-xs"
            onClick={() => {
              window.location.href = '/contact-registartion';
            }}
          >
            Go to registration
          </Button>
        </div>
      ) : (
        <>
          {message && <p className="text-xs text-emerald-700 dark:text-emerald-400">{message}</p>}
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

          <form onSubmit={handleSave} className="space-y-4 text-sm">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Name</label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                className="h-10"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-10"
              />
            </div>

            <fieldset className="space-y-2 border border-emerald-100/70 dark:border-emerald-900/50 rounded-xl p-3">
              <legend className="px-1 text-xs font-semibold text-muted-foreground">
                Change Password (optional)
              </legend>
              <p className="text-[11px] text-muted-foreground">
                To change your password, enter your current password and a new password with at
                least 6 characters.
              </p>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Current password
                </label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="h-10"
                  autoComplete="current-password"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  New password
                </label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="h-10"
                  autoComplete="new-password"
                />
              </div>
            </fieldset>

            <Button type="submit" disabled={isSaving} className="h-10 rounded-lg px-4">
              {isSaving ? 'Saving…' : 'Save changes'}
            </Button>
          </form>
        </>
      )}
    </section>
  );
};

export default ContactPortalProfilePage;

