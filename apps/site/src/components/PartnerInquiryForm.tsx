import { useState, type FormEvent } from 'react';

import { partner } from '@/content';

const orgTypes = ['Municipality', 'Tourism organization', 'Museum', 'Historian', 'Local business', 'Other'];

const interests = [
  'Destination collections',
  'Paid destination passes',
  'Partner distribution',
  'Labeled sponsorships',
  'Something else',
];

const inputClass =
  'w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]';
const labelClass = 'mb-2 block font-mono text-sm uppercase tracking-[0.15em] text-muted-foreground';

/**
 * Partner inquiry form. With no server behind the site, submitting opens the
 * visitor's email app with the details filled in, addressed to partners@.
 * To collect submissions without email, swap this for a form service
 * (e.g. Formspree) later.
 */
export default function PartnerInquiryForm() {
  const [sent, setSent] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const get = (k: string) => String(data.get(k) ?? '').trim();

    const subject = `Partner inquiry: ${get('organization') || get('name')}`;
    const body = [
      `Name: ${get('name')}`,
      `Email: ${get('email')}`,
      `Organization: ${get('organization')}`,
      `Organization type: ${get('orgType')}`,
      `Interested in: ${get('interest') || 'not given'}`,
      '',
      get('message'),
    ].join('\n');

    window.location.href = `mailto:${partner.form.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-primary/40 bg-primary/10 p-xl text-center">
        <span
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground"
          aria-hidden="true"
        >
          ✓
        </span>
        <h3 className="mt-base font-heading text-2xl text-foreground">Almost there.</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Your email app should have opened with your inquiry ready to send. If it didn't, write to{' '}
          <a className="text-primary underline" href={`mailto:${partner.form.email}`}>
            {partner.form.email}
          </a>
          .
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-lg font-mono text-sm uppercase tracking-[0.2em] text-primary hover:underline"
        >
          Back to the form
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid gap-base sm:grid-cols-2">
        <div>
          <label htmlFor="partner-name" className={labelClass}>
            Your name
          </label>
          <input id="partner-name" name="name" type="text" required className={inputClass} placeholder="Jordan Reyes" />
        </div>
        <div>
          <label htmlFor="partner-email" className={labelClass}>
            Email
          </label>
          <input id="partner-email" name="email" type="email" required className={inputClass} placeholder="you@organization.org" />
        </div>
      </div>

      <div className="mt-base grid gap-base sm:grid-cols-2">
        <div>
          <label htmlFor="partner-org" className={labelClass}>
            Organization
          </label>
          <input
            id="partner-org"
            name="organization"
            type="text"
            required
            className={inputClass}
            placeholder="Cape Fear Tourism Council"
          />
        </div>
        <div>
          <label htmlFor="partner-orgtype" className={labelClass}>
            Organization type
          </label>
          <select id="partner-orgtype" name="orgType" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Select one
            </option>
            {orgTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="mt-lg">
        <legend className={labelClass + ' mb-3'}>What interests you?</legend>
        <div className="flex flex-wrap gap-3">
          {interests.map((option) => (
            <label
              key={option}
              className="cursor-pointer rounded-full border border-border bg-background px-4 py-2 text-sm text-muted-foreground transition-colors duration-150 has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-foreground"
            >
              <input type="radio" name="interest" value={option} className="sr-only" />
              {option}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-lg">
        <label htmlFor="partner-message" className={labelClass}>
          About your place
        </label>
        <textarea
          id="partner-message"
          name="message"
          rows={5}
          className={inputClass}
          placeholder="Tell us about your destination, the stories you'd love to hear told there, and roughly when you'd want to launch."
        />
      </div>

      <button
        type="submit"
        className="mt-lg inline-flex items-center justify-center rounded-full bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground transition-opacity duration-150 hover:opacity-90"
      >
        Send inquiry
      </button>
    </form>
  );
}
