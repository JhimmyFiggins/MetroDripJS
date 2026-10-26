/**
 * MetroDrip Team Information
 * Authoritative content sourced from TIP_MetroDrip-Ecommerce (apps/storefront/views.py & developers.html).
 */

export const TEAM_HEADING = 'THE TEAM';

export const TEAM_SUBTITLE =
  'MetroDrip is built by a five-person development team from the Technological Institute of the Philippines — IT 009: Systems Integration & Architecture 1.';

export const TEAM_MEMBERS = [
  {
    id: 'navarro',
    name: 'Navarro, Arshad Edwin',
    role: 'Project Leader',
    bio: 'Full-stack architect responsible for systems integration strategy, sprint planning, and cross-team coordination. Leads the enterprise architecture alignment with course deliverables.',
    contribution: 'Architecture & Integration',
    avatar: '/assets/team/navarro.png',
    initials: 'AN',
  },
  {
    id: 'pameroyan',
    name: 'Pameroyan, Archim Paul C.',
    role: 'Backend Developer',
    bio: 'Designed and implemented the inventory management system, checkout saga, and payment gateway integration. Owns the stock reservation engine and concurrency-safe transaction flows.',
    contribution: 'Inventory & Payments',
    avatar: '/assets/team/pameroyan.png',
    initials: 'AP',
  },
  {
    id: 'deborja',
    name: 'De Borja, John Meickann M.',
    role: 'Frontend Developer',
    bio: 'Built the storefront UI using the MetroDrip design system with Django Templates, HTMX, and Alpine.js. Responsible for responsive layouts and WCAG AA accessibility compliance.',
    contribution: 'Storefront & UI/UX',
    avatar: '/assets/team/deborja.png',
    initials: 'JD',
  },
  {
    id: 'carlos',
    name: 'Carlos, Reuel L.',
    role: 'QA & DevOps Engineer',
    bio: 'Manages the CI/CD pipeline, Docker containerization, and deployment infrastructure. Authors the test suite covering concurrency gates, checkout flows, and migration integrity.',
    contribution: 'Testing & Deployment',
    avatar: '/assets/team/carlos.png',
    initials: 'RC',
  },
  {
    id: 'nogoy',
    name: 'Nogoy, Marcus Dylan',
    role: 'Database & Security Engineer',
    bio: 'Designed the MySQL 8 schema with InnoDB invariants, wrote the migration verification suite, and implemented webhook signature verification and CSRF protections across all endpoints.',
    contribution: 'Database & Security',
    avatar: '/assets/team/nogoy.png',
    initials: 'MN',
  },
];
