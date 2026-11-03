/* eslint-disable prettier/prettier */
// Canned starting points for the lead page's "Send Email" action — the
// superadmin picks one, edits the merged text, then sends; these are never
// sent verbatim. {{schoolName}} / {{adminName}} are replaced before the
// admin sees the draft.

export interface LeadEmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

export const LEAD_EMAIL_TEMPLATES: LeadEmailTemplate[] = [
  {
    id: 'demo_invite',
    name: 'Demo Invite',
    subject: 'A quick demo of SmartVan for {{schoolName}}?',
    body:
      "Hi {{adminName}},\n\n" +
      "Thanks for your interest in SmartVan. I'd love to show you how our live van tracking, parent app and driver app work together, and answer any questions about fitting it to {{schoolName}}'s routes.\n\n" +
      "Would you have 15-20 minutes this week for a quick call or screen-share demo?\n\n" +
      "Best,\nSmartVan Team",
  },
  {
    id: 'post_demo_followup',
    name: 'Follow-up After Demo',
    subject: 'Following up — SmartVan for {{schoolName}}',
    body:
      "Hi {{adminName}},\n\n" +
      "Great speaking with you about SmartVan for {{schoolName}}. I wanted to follow up and see if you had any questions since our call, or if you'd like to go ahead and get your account set up.\n\n" +
      "Happy to help with anything — just let me know.\n\n" +
      "Best,\nSmartVan Team",
  },
  {
    id: 'trial_welcome',
    name: 'Trial Welcome / Getting Started',
    subject: 'Welcome to SmartVan, {{schoolName}}!',
    body:
      "Hi {{adminName}},\n\n" +
      "Your SmartVan account for {{schoolName}} is ready. Here's how to get started:\n" +
      "1. Log in and add your vans and drivers\n" +
      "2. Register your students and assign them to routes\n" +
      "3. Invite parents to download the app and track live\n\n" +
      "I'm here if you need any help setting things up.\n\n" +
      "Best,\nSmartVan Team",
  },
  {
    id: 're_engagement',
    name: 'Re-engagement / Check-in',
    subject: 'Checking in — how is SmartVan going for {{schoolName}}?',
    body:
      "Hi {{adminName}},\n\n" +
      "Just checking in — how has SmartVan been working out for {{schoolName}} so far? If anything's unclear or you've hit a snag, I'm happy to jump on a quick call and help sort it out.\n\n" +
      "Best,\nSmartVan Team",
  },
  {
    id: 'thank_you_won',
    name: 'Thank You — Welcome Aboard',
    subject: 'Thank you for choosing SmartVan, {{schoolName}}!',
    body:
      "Hi {{adminName}},\n\n" +
      "Thank you for choosing SmartVan for {{schoolName}}. We're excited to have you on board and are here for anything you need as you get your fleet fully set up.\n\n" +
      "Best,\nSmartVan Team",
  },
];
