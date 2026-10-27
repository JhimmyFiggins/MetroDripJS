import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import * as webTeam from '../../web/customer/teamData.js';
import * as srcTeam from '../../src/data/teamData.js';

const EXPECTED_MEMBERS = [
  {
    name: 'Navarro, Arshad Edwin',
    role: 'Project Leader',
    contribution: 'Architecture & Integration',
    bio: 'Coordinates MetroDrip\'s modular-monolith architecture and the integration between the Django/DRF backend, responsive web interfaces, and Expo/React Native customer app. This role keeps cross-platform contracts, delivery priorities, and integration decisions aligned.',
    initials: 'AN',
  },
  {
    name: 'Pameroyan, Archim Paul C.',
    role: 'Backend Developer',
    contribution: 'Inventory & Payments',
    bio: 'Focuses on Django/DRF APIs for inventory, stock reservations, and server-authoritative checkout. This role supports transaction-safe order processing and PayMongo Hosted Checkout integration for configured online payment methods.',
    initials: 'AP',
  },
  {
    name: 'De Borja, John Meickann M.',
    role: 'Frontend Developer',
    contribution: 'Storefront & UI/UX',
    bio: 'Focuses on the HTML, CSS, and JavaScript storefront and the React Native/Expo customer experience. This role maintains responsive layouts, reusable interface patterns, and accessible states across supported screens.',
    initials: 'JD',
  },
  {
    name: 'Carlos, Reuel L.',
    role: 'QA & DevOps Engineer',
    contribution: 'Testing & Deployment',
    bio: 'Focuses on automated coverage across Django and Node.js tests, Playwright browser checks, and accessibility tooling. This role also maintains deployment configuration and Android build workflows while hosted deployment and device release gates remain unverified.',
    initials: 'RC',
  },
  {
    name: 'Nogoy, Marcus Dylan',
    role: 'Database & Security Engineer',
    contribution: 'Database & Security',
    bio: 'Focuses on Django ORM models, schemas, migrations, and SQLite/PostgreSQL compatibility. This role supports authentication, role-based access controls, PayMongo webhook signature verification, and transactional data integrity.',
    initials: 'MN',
  },
];

test('team dataset contains exactly 5 verified members matching source repository', () => {
  assert.equal(webTeam.TEAM_MEMBERS.length, 5);
  assert.equal(srcTeam.TEAM_MEMBERS.length, 5);
  assert.equal(webTeam.TEAM_HEADING, 'THE TEAM');
  assert.match(webTeam.TEAM_SUBTITLE, /five-person development team/);

  EXPECTED_MEMBERS.forEach((expected, i) => {
    const webMember = webTeam.TEAM_MEMBERS[i];
    const srcMember = srcTeam.TEAM_MEMBERS[i];

    assert.equal(webMember.name, expected.name);
    assert.equal(webMember.role, expected.role);
    assert.equal(webMember.contribution, expected.contribution);
    assert.equal(webMember.bio, expected.bio);
    assert.equal(webMember.initials, expected.initials);

    assert.equal(srcMember.name, expected.name);
    assert.equal(srcMember.role, expected.role);
    assert.equal(srcMember.contribution, expected.contribution);
    assert.equal(srcMember.bio, expected.bio);
    assert.equal(srcMember.initials, expected.initials);
    assert.equal((webMember.bio.match(/This role/g) || []).length, 1);
    assert.match(webMember.bio, /\. This role .+\.$/);
  });

  const biographies = webTeam.TEAM_MEMBERS.map((member) => member.bio).join(' ');
  assert.doesNotMatch(biographies, /HTMX|Alpine\.js|MySQL 8|five-service/i);
  assert.match(biographies, /Django\/DRF/);
  assert.match(biographies, /React Native\/Expo/);
  assert.match(biographies, /SQLite\/PostgreSQL/);
  assert.match(biographies, /PayMongo Hosted Checkout/);
});

test('profile photograph assets exist in both web and mobile assets directories', () => {
  const root = process.cwd();
  webTeam.TEAM_MEMBERS.forEach((member) => {
    const webPng = path.join(root, 'web/assets/team', `${member.id}.png`);
    const webJpg = path.join(root, 'web/assets/team', `${member.id}.jpg`);
    const mobilePng = path.join(root, 'mobile/assets/team', `${member.id}.png`);
    const mobileJpg = path.join(root, 'mobile/assets/team', `${member.id}.jpg`);

    assert.ok(fs.existsSync(webPng), `Missing web PNG for ${member.id}`);
    assert.ok(fs.existsSync(webJpg), `Missing web JPG for ${member.id}`);
    assert.ok(fs.existsSync(mobilePng), `Missing mobile PNG for ${member.id}`);
    assert.ok(fs.existsSync(mobileJpg), `Missing mobile JPG for ${member.id}`);
  });
});

test('mobile AppNavigator registers the Team screen and deep link', () => {
  const navigatorContent = fs.readFileSync(path.join(process.cwd(), 'mobile/navigation/AppNavigator.jsx'), 'utf8');
  assert.match(navigatorContent, /import TeamScreen from '\.\.\/Account_Management\/TeamScreen'/);
  assert.match(navigatorContent, /<Stack\.Screen name="Team" component={TeamScreen} \/>/);
  assert.match(navigatorContent, /Team: 'team'/);
});

test('mobile Account screen links to the Team screen for both authenticated and guest users', () => {
  const accountContent = fs.readFileSync(path.join(process.cwd(), 'mobile/Account_Management/Account.jsx'), 'utf8');
  assert.match(accountContent, /label="Our Team"/);
  assert.match(accountContent, /navigation\.navigate\('Team'\)/);
  assert.match(accountContent, /accessibilityLabel="Meet the team"/);
});

test('web customer storefront includes Team in routes and contracts', () => {
  const contractsContent = fs.readFileSync(path.join(process.cwd(), 'web/customer/contracts.js'), 'utf8');
  const appContent = fs.readFileSync(path.join(process.cwd(), 'web/customer/app.js'), 'utf8');
  const indexContent = fs.readFileSync(path.join(process.cwd(), 'web/customer/index.html'), 'utf8');

  assert.match(contractsContent, /if \(head === 'team' && parts\.length === 1\) return { name: 'team' };/);
  assert.match(appContent, /team: renderTeam/);
  assert.match(appContent, /async function renderTeam\(\)/);
  assert.match(indexContent, /href="\/customer\/team"/);
});
