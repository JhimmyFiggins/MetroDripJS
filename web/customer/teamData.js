/**
 * Authoritative team content shared by the web storefront and mobile app.
 * Descriptions define role responsibilities; repository history does not verify
 * individual authorship of each implemented feature.
 */

export const TEAM_HEADING = 'THE TEAM';

export const TEAM_SUBTITLE =
  'MetroDrip is built by a five-person development team from the Technological Institute of the Philippines — IT 009: Systems Integration & Architecture 1.';

export const TEAM_MEMBERS = [
  {
    id: 'navarro',
    name: 'Navarro, Arshad Edwin',
    role: 'Project Leader',
    bio: 'Coordinates MetroDrip\'s modular-monolith architecture and the integration between the Django/DRF backend, responsive web interfaces, and Expo/React Native customer app. This role keeps cross-platform contracts, delivery priorities, and integration decisions aligned.',
    contribution: 'Architecture & Integration',
    avatar: '/assets/team/navarro.png',
    initials: 'AN',
  },
  {
    id: 'pameroyan',
    name: 'Pameroyan, Archim Paul C.',
    role: 'Backend Developer',
    bio: 'Focuses on Django/DRF APIs for inventory, stock reservations, and server-authoritative checkout. This role supports transaction-safe order processing and PayMongo Hosted Checkout integration for configured online payment methods.',
    contribution: 'Inventory & Payments',
    avatar: '/assets/team/pameroyan.png',
    initials: 'AP',
  },
  {
    id: 'deborja',
    name: 'De Borja, John Meickann M.',
    role: 'Frontend Developer',
    bio: 'Focuses on the HTML, CSS, and JavaScript storefront and the React Native/Expo customer experience. This role maintains responsive layouts, reusable interface patterns, and accessible states across supported screens.',
    contribution: 'Storefront & UI/UX',
    avatar: '/assets/team/deborja.png',
    initials: 'JD',
  },
  {
    id: 'carlos',
    name: 'Carlos, Reuel L.',
    role: 'QA & DevOps Engineer',
    bio: 'Focuses on automated coverage across Django and Node.js tests, Playwright browser checks, and accessibility tooling. This role also maintains deployment configuration and Android build workflows while hosted deployment and device release gates remain unverified.',
    contribution: 'Testing & Deployment',
    avatar: '/assets/team/carlos.png',
    initials: 'RC',
  },
  {
    id: 'nogoy',
    name: 'Nogoy, Marcus Dylan',
    role: 'Database & Security Engineer',
    bio: 'Focuses on Django ORM models, schemas, migrations, and SQLite/PostgreSQL compatibility. This role supports authentication, role-based access controls, PayMongo webhook signature verification, and transactional data integrity.',
    contribution: 'Database & Security',
    avatar: '/assets/team/nogoy.png',
    initials: 'MN',
  },
];
