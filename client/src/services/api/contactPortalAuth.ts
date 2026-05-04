import { apiFetch, captureAuthTokenFromResponse } from './http';

type ProblemDetails = {
  title?: string;
  detail?: string;
  message?: string;
};

export interface ContactPortalProfile {
  contact_id: string;
  name: string;
  phone: string;
  email?: string;
  mark?: string;
  can_login?: boolean;
  /** True when this session is a guest (no persisted Contact). */
  is_guest?: boolean;
}

type ContactDto = {
  id?: string | number;
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  mark?: string;
  canLogin?: boolean;
  can_login?: boolean;
};

/** Strip HTTP status codes (e.g. "409 CONFLICT") from error messages — show only user-friendly text. */
function sanitizeErrorMessage(msg: string): string {
  return msg
    .replace(/^\s*\d{3}\s+(?:CONFLICT|Conflict)\s*[:\s"']*/gi, '')
    .replace(/^\s*\d{3}\s*[:\s"']+/g, '')
    .replace(/^(?:CONFLICT|Conflict)\s*[:\s"']+/gi, '')
    .trim()
    || msg.trim();
}

/** Return clean user message for known conflict/error patterns (avoids showing 409 CONFLICT etc). */
function messageForKnownError(detail: string): string | null {
  const d = detail.toLowerCase();
  if (d.includes('mark is already in use')) return 'This mark is already in use by another contact.';
  if (d.includes('contact is already registered with this phone')) return 'A contact is already registered with this phone number.';
  if (d.includes('contact is already registered with this email')) return 'A contact is already registered with this email address.';
  if (d.includes('this mobile number is already in use')) return 'This mobile number is already in use.';
  return null;
}

/** Parse registration error response to show specific validation messages instead of generic "failed to register". */
async function parseRegistrationError(res: Response): Promise<string> {
  try {
    const text = await res.text();
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json') || contentType.includes('application/problem+json')) {
      try {
        const problem: ProblemDetails = JSON.parse(text);
        const errorKey = typeof problem.message === 'string' ? problem.message : undefined;

        if (errorKey === 'error.contactPortal.phone.alreadyUsedByTrader') {
          return 'This mobile number is already in use.';
        }
        if (typeof problem.detail === 'string' && problem.detail.trim().length > 0) {
          const known = messageForKnownError(problem.detail);
          if (known) return known;
          return sanitizeErrorMessage(problem.detail);
        }
        if (typeof problem.title === 'string' && problem.title.trim().length > 0) {
          const cleaned = sanitizeErrorMessage(problem.title);
          if (cleaned && cleaned !== 'Conflict') return cleaned;
        }
      } catch {
        // not valid JSON, fall through to use raw text
      }
    }
    if (text && text.length > 0 && text.length < 300) {
      const known = messageForKnownError(text);
      if (known) return known;
      return sanitizeErrorMessage(text);
    }
  } catch {
    // ignore
  }
  return 'Registration failed. Please check your details and try again.';
}

function mapDtoToProfile(dto: ContactDto): ContactPortalProfile {
  const id = dto.id ?? '';
  return {
    contact_id: String(id),
    name: dto.name ?? '',
    phone: dto.phone ?? '',
    email: dto.email,
    mark: dto.mark,
    can_login: dto.can_login ?? dto.canLogin,
    is_guest: false,
  };
}

export interface ContactOtpVerifyResult {
  guest: boolean;
  phone: string;
  profile: ContactPortalProfile | null;
}

export interface ContactPortalSession {
  guest: boolean;
  phone: string;
  profile: ContactPortalProfile | null;
}

export const contactPortalAuthApi = {
  async signup(data: {
    phone: string;
    password: string;
    email?: string;
    name?: string;
    mark: string;
  }): Promise<ContactPortalProfile> {
    const res = await apiFetch('/auth/register-contact', {
      method: 'POST',
      body: JSON.stringify({
        phone: data.phone,
        password: data.password,
        email: data.email,
        name: data.name,
        mark: data.mark,
      }),
    });

    if (!res.ok) {
      const message = await parseRegistrationError(res);
      throw new Error(message);
    }

    const dto: ContactDto = await res.json();

    // Best-effort: capture contact JWT when backend issues one.
    captureAuthTokenFromResponse(res, 'contact');
    return mapDtoToProfile(dto);
  },

  async login(identifier: string, password: string): Promise<ContactPortalProfile> {
    const res = await apiFetch('/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        phone: identifier,
        password,
      }),
    });

    if (!res.ok) {
      let message = 'Login failed. Please try again.';
      try {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json') || contentType.includes('application/problem+json')) {
          const problem: ProblemDetails = await res.json();
          const errorKey = typeof problem.message === 'string' ? problem.message : undefined;

          if (errorKey === 'error.contactPortal.login.invalidCredentials') {
            message = 'The email or password you entered is incorrect. Please try again.';
          } else if (errorKey === 'error.contactPortal.login.disabled') {
            message = 'Your contact account is disabled. Please contact support.';
          } else if (typeof problem.detail === 'string' && problem.detail.trim().length > 0) {
            message = problem.detail;
          } else if (typeof problem.title === 'string' && problem.title.trim().length > 0) {
            message = problem.title;
          }
        } else {
          const text = await res.text();
          if (text && text.length < 200) {
            message = text;
          }
        }
      } catch {
        // ignore
      }
      throw new Error(message);
    }

    const dto: ContactDto = await res.json();

    // Capture contact portal JWT for native shells and web.
    captureAuthTokenFromResponse(res, 'contact');
    return mapDtoToProfile(dto);
  },

  async requestOtp(identifier: string): Promise<void> {
    const res = await apiFetch('/portal/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({
        identifier,
      }),
    });

    if (!res.ok) {
      let message = 'Failed to send OTP. Please try again.';
      try {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const problem: ProblemDetails = await res.json();
          const errorKey = typeof problem.message === 'string' ? problem.message : undefined;

          if (errorKey === 'error.contactPortal.phone.notRegistered') {
            message = 'This mobile number is not registered for a Contact login.';
          } else if (errorKey === 'error.contactPortal.phone.alreadyUsedByTrader') {
            // Do not reveal which account type owns this mobile; just block OTP flow.
            message = 'This mobile number is already in use.';
          } else if (errorKey === 'error.otp.provider.not_configured') {
            message =
              'We are unable to send OTPs right now. Please try again later or contact support.';
          } else if (errorKey === 'error.otp.send.failed') {
            message = 'We couldn’t send an OTP to this number. Please try again in a moment.';
          } else if (typeof problem.detail === 'string' && problem.detail.trim().length > 0) {
            message = problem.detail;
          } else if (typeof problem.title === 'string' && problem.title.trim().length > 0) {
            message = problem.title;
          }
        } else {
          const text = await res.text();
          if (text && text.length < 200) {
            message = text;
          }
        }
      } catch {
        // ignore
      }
      throw new Error(message);
    }
  },

  async verifyOtp(identifier: string, otp: string): Promise<ContactOtpVerifyResult> {
    const res = await apiFetch('/portal/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({
        identifier,
        otp,
      }),
    });

    if (!res.ok) {
      let message = 'OTP verification failed. Please try again.';
      try {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const problem: ProblemDetails = await res.json();
          const errorKey = typeof problem.message === 'string' ? problem.message : undefined;

          if (errorKey === 'error.otp.invalid_or_expired') {
            message =
              'The OTP you entered is invalid or has expired. Please request a new one.';
          } else if (errorKey === 'error.contactPortal.phone.alreadyUsedByTrader') {
            // Do not reveal which account type owns this mobile; just block guest login.
            message = 'This mobile number is already in use.';
          } else if (typeof problem.detail === 'string' && problem.detail.trim().length > 0) {
            message = problem.detail;
          } else if (typeof problem.title === 'string' && problem.title.trim().length > 0) {
            message = problem.title;
          }
        } else {
          const text = await res.text();
          if (text && text.length < 200) {
            message = text;
          }
        }
      } catch {
        // ignore
      }
      throw new Error(message);
    }

    const data: { guest: boolean; phone: string; contact?: ContactDto | null } = await res.json();

    // OTP login can also carry JWT headers; capture when present.
    captureAuthTokenFromResponse(res, 'contact');
    const profile = data.contact ? mapDtoToProfile(data.contact) : ({
      contact_id: '',
      name: data.phone,
      phone: data.phone,
      email: undefined,
      can_login: false,
      is_guest: true,
    } satisfies ContactPortalProfile);

    return {
      guest: data.guest,
      phone: data.phone,
      profile: profile ?? null,
    };
  },

  async getProfile(): Promise<ContactPortalProfile | null> {
    const res = await apiFetch('/portal/me', {
      method: 'GET',
    });

    if (res.status === 401 || res.status === 403) {
      return null;
    }

    if (!res.ok) {
      throw new Error('Failed to load contact profile');
    }

    const dto: ContactDto = await res.json();
    return mapDtoToProfile(dto);
  },

  async getSession(): Promise<ContactPortalSession | null> {
    const res = await apiFetch('/portal/session', {
      method: 'GET',
    });

    if (res.status === 401 || res.status === 403) {
      return null;
    }

    if (!res.ok) {
      throw new Error('Failed to load contact portal session');
    }

    const data: { guest: boolean; phone: string; contact?: ContactDto | null } = await res.json();
    const profile = data.contact ? mapDtoToProfile(data.contact) : ({
      contact_id: '',
      name: data.phone,
      phone: data.phone,
      email: undefined,
      can_login: false,
      is_guest: true,
    } satisfies ContactPortalProfile);

    return {
      guest: data.guest,
      phone: data.phone,
      profile: profile ?? null,
    };
  },

  async logout(): Promise<void> {
    // Best-effort: ask backend to clear ACCESS_TOKEN cookie for contact portal flows.
    // Ignore network errors so that client-side logout still completes.
    try {
      await apiFetch('/portal/auth/logout', {
        method: 'POST',
      });
    } catch {
      // no-op
    }
  },
};

