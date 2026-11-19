// ============================================================================
// EDITORIAL AUTHOR PERSONAS, TAXONOMY CATEGORIES & TAG DEFINITIONS
// All authors feature verified human portraits matched to realistic bios & beats
// ============================================================================

const EDITORIAL_AUTHORS = [
  {
    id: 'auth_bill_roberts',
    name: 'Bill Roberts',
    role: 'Founder & Managing Editor',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=240&q=80',
    bio: 'Leads methodology standards, independent product benchmarks, and consumer software reviews across Top 10.',
    location: 'San Francisco, CA',
    email: 'bill.roberts@top10.io',
    expertise: ['Consumer Apps', 'Audiobooks', 'Digital Media', 'Benchmark Methodology'],
    twitter: '@billroberts',
    linkedin: 'linkedin.com/in/billroberts-editorial',
    verified: true
  },
  {
    id: 'auth_priya_nair',
    name: 'Priya Nair',
    role: 'Principal Cloud & SRE Architect',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=240&q=80',
    bio: '12+ years designing distributed Kubernetes clusters, OpenTelemetry observability pipelines, and edge compute platforms.',
    location: 'Seattle, WA',
    email: 'priya.nair@top10.io',
    expertise: ['DevOps', 'Observability', 'Cloud Hosting', 'Kubernetes'],
    twitter: '@priyanair_sre',
    linkedin: 'linkedin.com/in/priya-nair-sre',
    verified: true
  },
  {
    id: 'auth_marcus_vance',
    name: 'Marcus Vance',
    role: 'Fintech & Payments Researcher',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=240&q=80',
    bio: 'Former Stripe & Adyen solutions engineer evaluating Merchant of Record tax compliance, usage metering, and SaaS billing APIs.',
    location: 'New York, NY',
    email: 'marcus.vance@top10.io',
    expertise: ['Billing Software', 'SaaS Monetization', 'Global VAT', 'Payments'],
    twitter: '@marcusvance_fin',
    linkedin: 'linkedin.com/in/marcus-vance-fintech',
    verified: true
  },
  {
    id: 'auth_daniel_morales',
    name: 'Daniel Morales',
    role: 'Studio Acoustics & Audio Engineer',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=240&q=80',
    bio: 'Mastering engineer and electro-acoustic consultant testing nearfield reference monitors, room correction DSP, and DACs.',
    location: 'Austin, TX',
    email: 'daniel.morales@top10.io',
    expertise: ['Studio Monitors', 'Pro Audio', 'Room Calibration', 'Acoustics'],
    twitter: '@dmorales_audio',
    linkedin: 'linkedin.com/in/daniel-morales-audio',
    verified: true
  },
  {
    id: 'auth_kenji_takahashi',
    name: 'Kenji Takahashi',
    role: 'Staff AI Systems Engineer',
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=240&q=80',
    bio: 'Evaluates autonomous coding agents, codebase-aware IDEs, local LLM inference latency, and developer productivity suites.',
    location: 'San Jose, CA',
    email: 'kenji.takahashi@top10.io',
    expertise: ['AI Coding Tools', 'Developer Tools', 'LLM Evaluation', 'IDE Agents'],
    twitter: '@kenji_ai_dev',
    linkedin: 'linkedin.com/in/kenji-takahashi-eng',
    verified: true
  },
  {
    id: 'auth_rachel_lin',
    name: 'Rachel Lin',
    role: 'VP of Revenue Operations & CRM Analyst',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=240&q=80',
    bio: 'Advises B2B SaaS revenue teams on enterprise CRM architecture, pipeline attribution, and workflow automation.',
    location: 'Chicago, IL',
    email: 'rachel.lin@top10.io',
    expertise: ['CRM Platforms', 'RevOps', 'B2B Sales', 'Pipeline Automation'],
    twitter: '@rachellin_revops',
    linkedin: 'linkedin.com/in/rachel-lin-revops',
    verified: true
  },
  {
    id: 'auth_hannah_oconnor',
    name: "Hannah O'Connor",
    role: 'Senior Product & Agile Strategist',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=240&q=80',
    bio: 'Product operations specialist reviewing issue trackers, roadmap software, and cross-functional knowledge bases.',
    location: 'Dublin, Ireland',
    email: 'hannah.oconnor@top10.io',
    expertise: ['Project Management', 'Product Ops', 'Agile Workflows', 'Team Collaboration'],
    twitter: '@hannahoc_pm',
    linkedin: 'linkedin.com/in/hannah-oconnor-pm',
    verified: true
  },
  {
    id: 'auth_sofia_patel',
    name: 'Sofia Patel',
    role: 'Lifecycle Marketing & Deliverability Lead',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=240&q=80',
    bio: 'Specializes in transactional email APIs, DMARC/DKIM deliverability benchmarks, and automated lifecycle segmentation.',
    location: 'London, UK',
    email: 'sofia.patel@top10.io',
    expertise: ['Email Marketing', 'Deliverability', 'Lifecycle Growth', 'MarTech'],
    twitter: '@sofiapatel_crm',
    linkedin: 'linkedin.com/in/sofia-patel-growth',
    verified: true
  },
  {
    id: 'auth_lucas_weber',
    name: 'Lucas Weber',
    role: 'Generative Media & VFX Producer',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=240&q=80',
    bio: 'Commercial film producer benchmarking text-to-video foundation models, temporal coherence, and studio licensing rights.',
    location: 'Berlin, Germany',
    email: 'lucas.weber@top10.io',
    expertise: ['AI Video', 'Creative Suites', 'Generative Media', 'Post-Production'],
    twitter: '@lucasweber_vfx',
    linkedin: 'linkedin.com/in/lucas-weber-media',
    verified: true
  },
  {
    id: 'auth_claire_bennett',
    name: 'Claire Bennett',
    role: 'Smart Kitchen & Appliance Editor',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=240&q=80',
    bio: 'Lab-tests precision countertop ovens, induction ranges, and connected home appliances for thermal accuracy and durability.',
    location: 'Portland, OR',
    email: 'claire.bennett@top10.io',
    expertise: ['Smart Ovens', 'Home Appliances', 'Culinary Tech', 'Hardware Testing'],
    twitter: '@clairebennett_hm',
    linkedin: 'linkedin.com/in/claire-bennett-lab',
    verified: true
  },
  {
    id: 'auth_david_mercer',
    name: 'David Mercer',
    role: 'ISF-Certified Display Calibrator',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=240&q=80',
    bio: 'Measures HDR peak nit output, color volume, HDMI 2.1 input lag, and anti-glare coatings on flagship OLED and Mini-LED TVs.',
    location: 'Toronto, Canada',
    email: 'david.mercer@top10.io',
    expertise: ['Smart TVs', 'OLED Displays', 'Home Theater', 'Display Calibration'],
    twitter: '@dmercer_av',
    linkedin: 'linkedin.com/in/david-mercer-display',
    verified: true
  },
  {
    id: 'auth_alex_thorne',
    name: 'Alex Thorne',
    role: 'Industrial Design & Accessories Critic',
    avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=240&q=80',
    bio: 'Drop-tests smartphone armor cases, aramid weaves, and MagSafe ergonomics to find protective hardware without pocket bulk.',
    location: 'Brooklyn, NY',
    email: 'alex.thorne@top10.io',
    expertise: ['Mobile Accessories', 'Industrial Design', 'Drop Testing', 'Hardware'],
    twitter: '@alexthorne_id',
    linkedin: 'linkedin.com/in/alex-thorne-design',
    verified: true
  },
  {
    id: 'auth_ryan_callahan',
    name: 'Ryan Callahan',
    role: 'Sports Analytics & Compliance Editor',
    avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=240&q=80',
    bio: 'Audits regulated sportsbook liquidity, live in-play odds pricing, payout settlement speeds, and responsible gaming controls.',
    location: 'Boston, MA',
    email: 'ryan.callahan@top10.io',
    expertise: ['Sportsbooks', 'Fintech Compliance', 'Live Odds', 'Marketplaces'],
    twitter: '@ryancallahan_an',
    linkedin: 'linkedin.com/in/ryan-callahan-ops',
    verified: true
  },
  {
    id: 'auth_maya_lin',
    name: 'Maya Lin',
    role: 'Cross-Platform Gaming & Esports Editor',
    avatar: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=240&q=80',
    bio: 'Benchmarks 120fps mobile game frame pacing, tactile controller support, and fair progression design across iOS and Android.',
    location: 'Los Angeles, CA',
    email: 'maya.lin@top10.io',
    expertise: ['Mobile Gaming', 'Esports', 'iOS & Android', 'Controller Tech'],
    twitter: '@mayalin_gg',
    linkedin: 'linkedin.com/in/maya-lin-gaming',
    verified: true
  }
];

const DEFAULT_TOPIC_CATEGORIES = [
  {
    slug: 'software',
    name: 'Software & AI',
    icon: '⚡',
    description: 'SaaS, Developer Infrastructure, AI Agents, CRM, Billing & Cloud Platforms.'
  },
  {
    slug: 'hardware',
    name: 'Hardware & Home',
    icon: '🖥️',
    description: 'Studio Audio, OLED Smart TVs, Precision Kitchen Appliances & Mobile Hardware.'
  },
  {
    slug: 'lifestyle',
    name: 'Lifestyle & Gaming',
    icon: '🎮',
    description: 'Audiobook Apps, Mobile Games & Regulated Entertainment Platforms.'
  }
];

function getAuthorsPool(customAuthors = []) {
  const map = new Map();
  for (const a of EDITORIAL_AUTHORS) {
    map.set(a.id, { ...a });
  }
  if (Array.isArray(customAuthors)) {
    for (const a of customAuthors) {
      if (a && (a.id || a.name)) {
        const id = a.id || `auth_${String(a.name).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
        map.set(id, { ...(map.get(id) || {}), ...a, id });
      }
    }
  }
  return Array.from(map.values());
}

function resolveAuthor(customAuthors = [], query = {}) {
  const pool = getAuthorsPool(customAuthors);
  if (query.authorId) {
    const byId = pool.find((a) => a.id === query.authorId);
    if (byId) return byId;
  }
  if (query.authorName) {
    const target = String(query.authorName).trim().toLowerCase();
    const byName = pool.find((a) => a.name.toLowerCase() === target);
    if (byName) return byName;
    return {
      id: `auth_${target.replace(/[^a-z0-9]+/g, '_')}`,
      name: String(query.authorName).trim(),
      role: query.authorRole || 'Staff Contributor',
      avatar: query.authorAvatar || pool[0].avatar,
      bio: query.authorBio || `${String(query.authorName).trim()} covers independent benchmarks and buyer guides on Top 10.`,
      location: 'Remote',
      expertise: [],
      verified: false
    };
  }
  return pool[0];
}

module.exports = {
  EDITORIAL_AUTHORS,
  DEFAULT_TOPIC_CATEGORIES,
  getAuthorsPool,
  resolveAuthor
};
