// ============================================================================
// TOP 10 — READER-FIRST PRODUCT COMPARISONS, BUYING GUIDES & REVIEWS
// Clean Editorial UX + Comparison Matrix + Deep Pros/Cons + SEO & AI Schema
// ============================================================================

(function () {
  // Automatic Bearer Token Interceptor for Authenticated API Requests
  const originalFetch = window.fetch;
  window.fetch = function (url, options = {}) {
    const token = localStorage.getItem('top10_token');
    if (token && typeof url === 'string' && url.startsWith('/api/')) {
      options = options || {};
      options.headers = options.headers || {};
      if (options.headers instanceof Headers) {
        if (!options.headers.has('Authorization')) {
          options.headers.set('Authorization', `Bearer ${token}`);
        }
      } else if (Array.isArray(options.headers)) {
        if (!options.headers.some(([k]) => k.toLowerCase() === 'authorization')) {
          options.headers.push(['Authorization', `Bearer ${token}`]);
        }
      } else {
        if (!options.headers['Authorization']) {
          options.headers['Authorization'] = `Bearer ${token}`;
        }
      }
    }
    return originalFetch.call(this, url, options);
  };

  let appState = null;
  let currentUser = null;
  let currentView = 'home'; // 'home' | 'list' | 'blog' | 'article' | 'admin' | 'compare'
  let currentCompareA = null;
  let currentCompareB = null;
  let currentCategorySlug = 'billing-software';
  let currentTab = 'rankings'; // 'rankings' | 'context'
  let pendingAttachments = [];
  let selectedModalRank = 1;
  let activeQuickFilter = 'all'; // 'all' | 'free' | 'api' | 'enterprise' | 'saved'
  let activeAnalyticsRange = '30d'; // '7d' | '30d' | '1y'
  let currentBidMode = 'new'; // 'new' | 'existing'

  // Persisted Bookmark Shortlist, Liked Reviews & Live View Bumps
  let savedProductIds = new Set(JSON.parse(localStorage.getItem('top10_saved_products') || '[]'));
  let likedCommentIds = new Set(JSON.parse(localStorage.getItem('top10_liked_comments') || '[]'));
  let categoryViewBumps = JSON.parse(localStorage.getItem('top10_view_bumps') || '{}');

  function persistSavedProducts() {
    localStorage.setItem('top10_saved_products', JSON.stringify([...savedProductIds]));
  }
  function persistLikedComments() {
    localStorage.setItem('top10_liked_comments', JSON.stringify([...likedCommentIds]));
  }
  function bumpCategoryViewCount(slug) {
    if (!slug) return;
    categoryViewBumps[slug] = (categoryViewBumps[slug] || 0) + 1;
    localStorage.setItem('top10_view_bumps', JSON.stringify(categoryViewBumps));
  }
  function formatBumpedViews(rawViewsStr, slug) {
    const str = String(rawViewsStr || '120k').trim();
    const bump = Number(categoryViewBumps[slug] || 0);
    if (!bump) return str;
    const matchK = str.match(/^([\d.]+)k$/i);
    if (matchK) {
      const baseNum = Math.round(parseFloat(matchK[1]) * 1000) + bump;
      return `${(baseNum / 1000).toFixed(2)}k`;
    }
    return str;
  }

  // Theme initialization (Dark / Light mode)
  const savedTheme = localStorage.getItem('top10_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // Check initial URL path (/list/:slug, /blog, /blog/:slug, /admin, /compare/:catSlug/:slugA-vs-:slugB, or /?list=:slug)
  const initialPath = window.location.pathname;
  const initialPathMatch = initialPath.match(/^\/list\/([^/]+)$/);
  const initialBlogMatch = initialPath.match(/^\/blog\/([^/]+)$/);
  const initialCompareMatch = initialPath.match(/^\/compare\/([^/]+)\/([^/]+)-vs-([^/]+)$/);
  const initialUrlParams = new URLSearchParams(window.location.search);
  const initialSlugFromUrl = initialPathMatch
    ? initialPathMatch[1]
    : initialUrlParams.get('list');

  let currentBlogSlug = null;

  if (initialSlugFromUrl) {
    currentCategorySlug = initialSlugFromUrl;
    currentView = 'list';
  } else if (initialCompareMatch) {
    currentCategorySlug = initialCompareMatch[1];
    currentCompareA = initialCompareMatch[2];
    currentCompareB = initialCompareMatch[3];
    currentView = 'compare';
  } else if (initialBlogMatch) {
    currentBlogSlug = initialBlogMatch[1];
    currentView = 'article';
  } else if (initialPath === '/blog') {
    currentView = 'blog';
  } else if (initialPath === '/admin') {
    currentView = 'admin';
  }

  // DOM Elements — Topbar
  const brandHomeBtn = document.getElementById('brandHomeBtn');
  const navGuidesBtn = document.getElementById('navGuidesBtn');
  const navBlogBtn = document.getElementById('navBlogBtn');
  const navAdminBtn = document.getElementById('navAdminBtn');
  const navFounderPortalBtn = document.getElementById('navFounderPortalBtn');
  const categoryDropdownBtn = document.getElementById('categoryDropdownBtn');
  const categoryDropdownMenu = document.getElementById('categoryDropdownMenu');
  const categoryMenuList = document.getElementById('categoryMenuList');
  const catTotalCountBadge = document.getElementById('catTotalCountBadge');
  const topCatIcon = document.getElementById('topCatIcon');
  const topCatName = document.getElementById('topCatName');
  const dropdownCreateListBtn = document.getElementById('dropdownCreateListBtn');
  const topbarSearchInput = document.getElementById('topbarSearchInput');
  const topbarSearchKbd = document.getElementById('topbarSearchKbd');
  const topbarSearchClearBtn = document.getElementById('topbarSearchClearBtn');
  const topbarLiveSearchDropdown = document.getElementById('topbarLiveSearchDropdown');
  const openBidModalBtn = document.getElementById('openBidModalBtn');
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeIconMoon = document.getElementById('themeIconMoon');
  const themeIconSun = document.getElementById('themeIconSun');

  // User Menu & Profile
  const userAvatarBtn = document.getElementById('userAvatarBtn');
  const currentUserAvatar = document.getElementById('currentUserAvatar');
  const userDropdownMenu = document.getElementById('userDropdownMenu');
  const userMenuCurrentInfo = document.getElementById('userMenuCurrentInfo');
  const demoUsersList = document.getElementById('demoUsersList');
  const openCustomLoginBtn = document.getElementById('openCustomLoginBtn');

  // Blog Elements
  const blogIndexSection = document.getElementById('blogIndexSection');
  const blogFeaturedLead = document.getElementById('blogFeaturedLead');
  const blogCardsGrid = document.getElementById('blogCardsGrid');
  const blogTotalCountBadge = document.getElementById('blogTotalCountBadge');
  const blogArticleSection = document.getElementById('blogArticleSection');
  const articleBackToBlogBtn = document.getElementById('articleBackToBlogBtn');
  const articleBreadcrumbCat = document.getElementById('articleBreadcrumbCat');
  const articleMetaCategory = document.getElementById('articleMetaCategory');
  const articleMetaReadTime = document.getElementById('articleMetaReadTime');
  const articleMetaDate = document.getElementById('articleMetaDate');
  const articleMainTitle = document.getElementById('articleMainTitle');
  const articleMainSubtitle = document.getElementById('articleMainSubtitle');
  const articleAuthorAvatar = document.getElementById('articleAuthorAvatar');
  const articleAuthorName = document.getElementById('articleAuthorName');
  const articleAuthorBio = document.getElementById('articleAuthorBio');
  const articleTakeawaysList = document.getElementById('articleTakeawaysList');
  const articleBodyContent = document.getElementById('articleBodyContent');
  const articleFeaturedStrip = document.getElementById('articleFeaturedStrip');
  const articleFeaturedProductsGrid = document.getElementById('articleFeaturedProductsGrid');
  const articleViewFullListBtn = document.getElementById('articleViewFullListBtn');

  // Admin View Elements
  const adminViewSection = document.getElementById('adminViewSection');
  const adminExitBtn = document.getElementById('adminExitBtn');
  const adminKpiRevenue = document.getElementById('adminKpiRevenue');
  const adminKpiCategories = document.getElementById('adminKpiCategories');
  const adminKpiProducts = document.getElementById('adminKpiProducts');
  const adminKpiLeads = document.getElementById('adminKpiLeads');
  const adminProductSearchInput = document.getElementById('adminProductSearchInput');
  const adminCategoryFilterSelect = document.getElementById('adminCategoryFilterSelect');
  const adminProductsTableBody = document.getElementById('adminProductsTableBody');
  const adminNewCategoryBtn = document.getElementById('adminNewCategoryBtn');
  const adminCategoriesTableBody = document.getElementById('adminCategoriesTableBody');
  const adminTransactionsTableBody = document.getElementById('adminTransactionsTableBody');

  // Account Modal Elements
  const accountModalBackdrop = document.getElementById('accountModalBackdrop');
  const closeAccountModalBtn = document.getElementById('closeAccountModalBtn');
  const accBannerAvatar = document.getElementById('accBannerAvatar');
  const accBannerName = document.getElementById('accBannerName');
  const accBannerRole = document.getElementById('accBannerRole');
  const accBannerEmail = document.getElementById('accBannerEmail');
  const accBannerCompany = document.getElementById('accBannerCompany');
  const accBookmarksCount = document.getElementById('accBookmarksCount');
  const accProfileForm = document.getElementById('accProfileForm');
  const accInputName = document.getElementById('accInputName');
  const accInputEmail = document.getElementById('accInputEmail');
  const accInputCompany = document.getElementById('accInputCompany');
  const accBookmarksEmpty = document.getElementById('accBookmarksEmpty');
  const accBookmarksList = document.getElementById('accBookmarksList');
  const accSponsoredList = document.getElementById('accSponsoredList');
  const accReceiptsList = document.getElementById('accReceiptsList');
  const accSwitchPills = document.getElementById('accSwitchPills');

  // Homepage View Elements
  const homePageView = document.getElementById('homePageView');
  const homeBigSearchInput = document.getElementById('homeBigSearchInput');
  const searchKbdBadge = document.getElementById('searchKbdBadge');
  const clearBigSearchBtn = document.getElementById('clearBigSearchBtn');
  const homeLiveSearchDropdown = document.getElementById('homeLiveSearchDropdown');
  const homeQuickTopicChips = document.getElementById('homeQuickTopicChips');
  const searchNotFoundPaywall = document.getElementById('searchNotFoundPaywall');
  const nfHeadingText = document.getElementById('nfHeadingText');
  const nfListNameStrong = document.getElementById('nfListNameStrong');
  const nfBtnLabelSpan = document.getElementById('nfBtnLabelSpan');
  const nfCreateListPaywallBtn = document.getElementById('nfCreateListPaywallBtn');
  const homeGridHeading = document.getElementById('homeGridHeading');
  const homeListsGrid = document.getElementById('homeListsGrid');

  // Single List Page View Elements
  const singleListPageView = document.getElementById('singleListPageView');
  const backToHomeBtn = document.getElementById('backToHomeBtn');
  const breadcrumbCurrentTitle = document.getElementById('breadcrumbCurrentTitle');
  const heroCatIcon = document.getElementById('heroCatIcon');
  const heroUpdatedAgo = document.getElementById('heroUpdatedAgo');
  const heroPaidBadge = document.getElementById('heroPaidBadge');
  const refreshStateBtn = document.getElementById('refreshStateBtn');
  const heroCatTitle = document.getElementById('heroCatTitle');
  const copyListUrlBtn = document.getElementById('copyListUrlBtn');
  const copyListUrlLabel = document.getElementById('copyListUrlLabel');
  const openCategoryRfpBtn = document.getElementById('openCategoryRfpBtn');
  const heroCatSubtitle = document.getElementById('heroCatSubtitle');
  const listQuickFilterBar = document.getElementById('listQuickFilterBar');
  const analyticsRangeTabs = document.getElementById('analyticsRangeTabs');
  const trendViewsPill = document.getElementById('trendViewsPill');
  const trendReviewsPill = document.getElementById('trendReviewsPill');
  const trendListingsPill = document.getElementById('trendListingsPill');
  const sparkViewsSvg = document.getElementById('sparkViewsSvg');
  const sparkReviewsSvg = document.getElementById('sparkReviewsSvg');
  const sparkListingsSvg = document.getElementById('sparkListingsSvg');
  const kpiViews = document.getElementById('kpiViews');
  const kpiReviews = document.getElementById('kpiReviews');
  const kpiTotalListings = document.getElementById('kpiTotalListings');
  const heroBigAddPlatformBtn = document.getElementById('heroBigAddPlatformBtn');
  const commentCountBadge = document.getElementById('commentCountBadge');
  const backToTopPill = document.getElementById('backToTopPill');
  const compareSavedPill = document.getElementById('compareSavedPill');
  const compareSavedPillText = document.getElementById('compareSavedPillText');
  const relatedDirectoriesSection = document.getElementById('relatedDirectoriesSection');
  const relatedDirectoriesGrid = document.getElementById('relatedDirectoriesGrid');
  const viewAllDirectoriesFooterBtn = document.getElementById('viewAllDirectoriesFooterBtn');

  // Single List Guide Content Containers
  const tabPanelRankings = document.getElementById('tabPanelRankings');
  const tabPanelCompare = document.getElementById('tabPanelCompare');
  const tabPanelFaq = document.getElementById('tabPanelFaq');
  const tabPanelContext = document.getElementById('tabPanelContext');
  const tldrSummaryGrid = document.getElementById('tldrSummaryGrid');
  const comparisonTableBody = document.getElementById('comparisonTableBody');
  const top10TimelineList = document.getElementById('top10TimelineList');
  const moreListingsSection = document.getElementById('moreListingsSection');
  const moreListingsTitle = document.getElementById('moreListingsTitle');
  const toggleMoreListingsBtn = document.getElementById('toggleMoreListingsBtn');
  const moreListingsTimeline = document.getElementById('moreListingsTimeline');
  const methodologyText = document.getElementById('methodologyText');
  const faqAccordionList = document.getElementById('faqAccordionList');
  const footerBrandSubmitBtn = document.getElementById('footerBrandSubmitBtn');

  // Context & Comments
  const commentSearchInput = document.getElementById('commentSearchInput');
  const commentTypeFilter = document.getElementById('commentTypeFilter');
  const commentForm = document.getElementById('commentForm');
  const commentTextarea = document.getElementById('commentTextarea');
  const commentProductTag = document.getElementById('commentProductTag');
  const composerUserAvatar = document.getElementById('composerUserAvatar');
  const composerPostingAs = document.getElementById('composerPostingAs');
  const attachDemoFileBtn = document.getElementById('attachDemoFileBtn');
  const composerAttachmentsPreview = document.getElementById('composerAttachmentsPreview');
  const commentsTimelineContainer = document.getElementById('commentsTimelineContainer');

  // Modal 1: Brand Submit / Sponsor Rank (New Platform vs Boost Existing)
  const bidModalBackdrop = document.getElementById('bidModalBackdrop');
  const closeBidModalBtn = document.getElementById('closeBidModalBtn');
  const cancelBidModalBtn = document.getElementById('cancelBidModalBtn');
  const bidModalCategoryPill = document.getElementById('bidModalCategoryPill');
  const bidModalHeadingTitle = document.getElementById('bidModalHeadingTitle');
  const bidModeTabs = document.getElementById('bidModeTabs');
  const bidNewFieldsWrap = document.getElementById('bidNewFieldsWrap');
  const bidExistingFieldsWrap = document.getElementById('bidExistingFieldsWrap');
  const bidExistingProductSelect = document.getElementById('bidExistingProductSelect');
  const bidRetainerFieldsWrap = document.getElementById('bidRetainerFieldsWrap');
  const bidRetainerProductSelect = document.getElementById('bidRetainerProductSelect');
  const retainerCardLock1 = document.getElementById('retainerCardLock1');
  const retainerCardTop3 = document.getElementById('retainerCardTop3');
  const bidAmountFieldsWrap = document.getElementById('bidAmountFieldsWrap');
  let selectedRetainerTier = 'lock_rank_1';
  const bidCheckoutForm = document.getElementById('bidCheckoutForm');
  const bidUrlFaviconPreview = document.getElementById('bidUrlFaviconPreview');
  const bidProductName = document.getElementById('bidProductName');
  const bidCompanyName = document.getElementById('bidCompanyName');
  const bidWebsite = document.getElementById('bidWebsite');
  const bidPricingTag = document.getElementById('bidPricingTag');
  const bidHighlightTag = document.getElementById('bidHighlightTag');
  const bidOwnerEmail = document.getElementById('bidOwnerEmail');
  const bidTagline = document.getElementById('bidTagline');
  const modalRankPickerGrid = document.getElementById('modalRankPickerGrid');
  const bidPaymentAmount = document.getElementById('bidPaymentAmount');
  const rankSimulationBanner = document.getElementById('rankSimulationBanner');
  const submitBidBtn = document.getElementById('submitBidBtn');

  // Modal 2: Create New Guide ($99 Paywall)
  const createListModalBackdrop = document.getElementById('createListModalBackdrop');
  const closeCreateListModalBtn = document.getElementById('closeCreateListModalBtn');
  const cancelCreateListModalBtn = document.getElementById('cancelCreateListModalBtn');
  const createListPaywallForm = document.getElementById('createListPaywallForm');
  const newListTitleInput = document.getElementById('newListTitleInput');
  const newListProdName = document.getElementById('newListProdName');
  const newListCompany = document.getElementById('newListCompany');
  const newListWebsite = document.getElementById('newListWebsite');
  const newListPricing = document.getElementById('newListPricing');
  const newListHighlight = document.getElementById('newListHighlight');
  const newListEmail = document.getElementById('newListEmail');
  const newListTagline = document.getElementById('newListTagline');
  const newListFeeInput = document.getElementById('newListFeeInput');

  // Modal 3: Login
  const loginModalBackdrop = document.getElementById('loginModalBackdrop');
  const closeLoginModalBtn = document.getElementById('closeLoginModalBtn');
  const cancelLoginModalBtn = document.getElementById('cancelLoginModalBtn');
  const loginForm = document.getElementById('loginForm');
  const loginName = document.getElementById('loginName');
  const loginEmail = document.getElementById('loginEmail');
  const loginCompany = document.getElementById('loginCompany');

  // Modal 4: 1-Click Embed Badge Generator
  const badgeModalBackdrop = document.getElementById('badgeModalBackdrop');
  const badgeModalCategoryEyebrow = document.getElementById('badgeModalCategoryEyebrow');
  const badgeModalTitle = document.getElementById('badgeModalTitle');
  const closeBadgeModalBtn = document.getElementById('closeBadgeModalBtn');
  const doneBadgeModalBtn = document.getElementById('doneBadgeModalBtn');
  const badgePreviewImg = document.getElementById('badgePreviewImg');
  const badgeHtmlCode = document.getElementById('badgeHtmlCode');
  const badgeMarkdownCode = document.getElementById('badgeMarkdownCode');
  const copyBadgeHtmlBtn = document.getElementById('copyBadgeHtmlBtn');
  const copyBadgeMdBtn = document.getElementById('copyBadgeMdBtn');

  // Modal 5: On-Demand Compare Saved Platforms
  const compareSavedModalBackdrop = document.getElementById('compareSavedModalBackdrop');
  const compareModalEyebrow = document.getElementById('compareModalEyebrow');
  const compareModalTitle = document.getElementById('compareModalTitle');
  const closeCompareModalBtn = document.getElementById('closeCompareModalBtn');
  const compareSavedGrid = document.getElementById('compareSavedGrid');

  // Modal 6: High-Res Product Image & Hardware Lightbox
  const imageLightboxModalBackdrop = document.getElementById('imageLightboxModalBackdrop');

  // Modal 7: Community "+ Write a Review" Modal
  const openWriteReviewModalBtn = document.getElementById('openWriteReviewModalBtn');
  const writeReviewModalBackdrop = document.getElementById('writeReviewModalBackdrop');
  const closeWriteReviewModalBtn = document.getElementById('closeWriteReviewModalBtn');
  const cancelWriteReviewBtn = document.getElementById('cancelWriteReviewBtn');
  const writeReviewForm = document.getElementById('writeReviewForm');
  const reviewModalCategoryEyebrow = document.getElementById('reviewModalCategoryEyebrow');
  const reviewProductSelect = document.getElementById('reviewProductSelect');
  const starRatingPicker = document.getElementById('starRatingPicker');
  const starRatingLabel = document.getElementById('starRatingLabel');
  const reviewStarValue = document.getElementById('reviewStarValue');
  const reviewAuthorName = document.getElementById('reviewAuthorName');
  const reviewAuthorEmail = document.getElementById('reviewAuthorEmail');
  const reviewAuthorRole = document.getElementById('reviewAuthorRole');
  const reviewBodyText = document.getElementById('reviewBodyText');
  const reviewProsChips = document.getElementById('reviewProsChips');
  const verifiedReviewsCount = document.getElementById('verifiedReviewsCount');

  // Modal 8: "Claim This Listing" Verification Workflow
  const claimListingModalBackdrop = document.getElementById('claimListingModalBackdrop');
  const closeClaimModalBtn = document.getElementById('closeClaimModalBtn');
  const cancelClaimBtn = document.getElementById('cancelClaimBtn');
  const claimModalTitle = document.getElementById('claimModalTitle');
  const claimTargetProdName = document.getElementById('claimTargetProdName');
  const claimSendCodeForm = document.getElementById('claimSendCodeForm');
  const claimVerifyCodeForm = document.getElementById('claimVerifyCodeForm');
  const claimWorkEmail = document.getElementById('claimWorkEmail');
  const claimOtpInput = document.getElementById('claimOtpInput');
  const claimSentEmailLabel = document.getElementById('claimSentEmailLabel');
  const backToClaimEmailBtn = document.getElementById('backToClaimEmailBtn');
  const devOtpBanner = document.getElementById('devOtpBanner');
  let activeClaimTarget = null;

  // Modal 9: 1-Click Viral Social Sharing Assets
  const openShareModalBtn = document.getElementById('openShareModalBtn');
  const shareRankingModalBackdrop = document.getElementById('shareRankingModalBackdrop');
  const closeShareModalBtn = document.getElementById('closeShareModalBtn');
  const shareModalTitle = document.getElementById('shareModalTitle');
  const shareOgPreviewImg = document.getElementById('shareOgPreviewImg');
  const sharePostCopyText = document.getElementById('sharePostCopyText');
  const shareTwitterBtn = document.getElementById('shareTwitterBtn');
  const shareLinkedinBtn = document.getElementById('shareLinkedinBtn');
  const shareWhatsappBtn = document.getElementById('shareWhatsappBtn');
  const shareCopyLinkBtn = document.getElementById('shareCopyLinkBtn');

  // Admin Review Moderation Queue
  const adminTabReviews = document.getElementById('adminTabReviews');
  const adminPendingReviewsBadge = document.getElementById('adminPendingReviewsBadge');
  const adminReviewsTableBody = document.getElementById('adminReviewsTableBody');
  const adminReviewSearchInput = document.getElementById('adminReviewSearchInput');
  const adminReviewStatusFilter = document.getElementById('adminReviewStatusFilter');
  let activeModerationFilter = 'all';
  const lightboxModalEyebrow = document.getElementById('lightboxModalEyebrow');
  const lightboxModalTitle = document.getElementById('lightboxModalTitle');
  const closeLightboxModalBtn = document.getElementById('closeLightboxModalBtn');
  const lightboxLargeImg = document.getElementById('lightboxLargeImg');
  const lightboxSpecTag = document.getElementById('lightboxSpecTag');
  const lightboxCaption = document.getElementById('lightboxCaption');
  const lightboxVisitBtn = document.getElementById('lightboxVisitBtn');

  // View 4B: Head-to-Head Comparison Elements
  const compareHeadToHeadView = document.getElementById('compareHeadToHeadView');
  const compareBackBtn = document.getElementById('compareBackBtn');
  const compareCatNameCrumb = document.getElementById('compareCatNameCrumb');
  const compareVersusTitle = document.getElementById('compareVersusTitle');
  const compareShareBtn = document.getElementById('compareShareBtn');
  const compareRankA = document.getElementById('compareRankA');
  const compareLogoA = document.getElementById('compareLogoA');
  const compareNameA = document.getElementById('compareNameA');
  const compareCompanyA = document.getElementById('compareCompanyA');
  const compareTaglineA = document.getElementById('compareTaglineA');
  const comparePriceA = document.getElementById('comparePriceA');
  const compareTrialA = document.getElementById('compareTrialA');
  const compareVisitBtnA = document.getElementById('compareVisitBtnA');
  const compareRankB = document.getElementById('compareRankB');
  const compareLogoB = document.getElementById('compareLogoB');
  const compareNameB = document.getElementById('compareNameB');
  const compareCompanyB = document.getElementById('compareCompanyB');
  const compareTaglineB = document.getElementById('compareTaglineB');
  const comparePriceB = document.getElementById('comparePriceB');
  const compareTrialB = document.getElementById('compareTrialB');
  const compareVisitBtnB = document.getElementById('compareVisitBtnB');
  const compareVerdictTitle = document.getElementById('compareVerdictTitle');
  const compareVerdictBody = document.getElementById('compareVerdictBody');
  const compareWinnerDev = document.getElementById('compareWinnerDev');
  const compareWinnerValue = document.getElementById('compareWinnerValue');
  const thMatrixNameA = document.getElementById('thMatrixNameA');
  const thMatrixNameB = document.getElementById('thMatrixNameB');
  const compareMatrixTableBody = document.getElementById('compareMatrixTableBody');
  const pcTitleNameA = document.getElementById('pcTitleNameA');
  const pcContentA = document.getElementById('pcContentA');
  const pcTitleNameB = document.getElementById('pcTitleNameB');
  const pcContentB = document.getElementById('pcContentB');
  const compareAltChips = document.getElementById('compareAltChips');

  // Modal 10: B2B Enterprise Quote / RFP Modal
  const requestRfpModalBackdrop = document.getElementById('requestRfpModalBackdrop');
  const closeRfpModalBtn = document.getElementById('closeRfpModalBtn');
  const cancelRfpModalBtn = document.getElementById('cancelRfpModalBtn');
  const requestRfpForm = document.getElementById('requestRfpForm');
  const rfpModalTitle = document.getElementById('rfpModalTitle');
  const rfpCategorySlug = document.getElementById('rfpCategorySlug');
  const rfpBuyerName = document.getElementById('rfpBuyerName');
  const rfpBuyerEmail = document.getElementById('rfpBuyerEmail');
  const rfpCompanyName = document.getElementById('rfpCompanyName');
  const rfpTeamSize = document.getElementById('rfpTeamSize');
  const rfpEstimatedBudget = document.getElementById('rfpEstimatedBudget');
  const rfpTimeline = document.getElementById('rfpTimeline');
  const rfpVendorsPicker = document.getElementById('rfpVendorsPicker');
  const rfpNotes = document.getElementById('rfpNotes');
  const submitRfpBtn = document.getElementById('submitRfpBtn');
  let selectedRfpVendors = new Set();

  // Modal 11: Founder Self-Serve Portal & Specs Editor
  const founderPortalModalBackdrop = document.getElementById('founderPortalModalBackdrop');
  const closeFounderPortalBtn = document.getElementById('closeFounderPortalBtn');
  const founderPortalTitle = document.getElementById('founderPortalTitle');
  const founderProductSelect = document.getElementById('founderProductSelect');
  const founderMetricViews = document.getElementById('founderMetricViews');
  const founderMetricClicks = document.getElementById('founderMetricClicks');
  const founderMetricCtr = document.getElementById('founderMetricCtr');
  const founderMetricSaves = document.getElementById('founderMetricSaves');
  const founderPortalTabs = document.getElementById('founderPortalTabs');
  const founderEditorForm = document.getElementById('founderEditorForm');
  const fEditCategorySlug = document.getElementById('fEditCategorySlug');
  const fEditProductId = document.getElementById('fEditProductId');
  const fEditName = document.getElementById('fEditName');
  const fEditWebsite = document.getElementById('fEditWebsite');
  const fEditTagline = document.getElementById('fEditTagline');
  const fEditPrice = document.getElementById('fEditPrice');
  const fEditTrial = document.getElementById('fEditTrial');
  const fEditIdealFor = document.getElementById('fEditIdealFor');
  const fEditPlatforms = document.getElementById('fEditPlatforms');
  const fEditPro1 = document.getElementById('fEditPro1');
  const fEditPro2 = document.getElementById('fEditPro2');
  const fEditCon1 = document.getElementById('fEditCon1');
  const fEditCon2 = document.getElementById('fEditCon2');
  const fEditHeroImage = document.getElementById('fEditHeroImage');
  const fEditOverlayTag = document.getElementById('fEditOverlayTag');
  const saveFounderSpecsBtn = document.getElementById('saveFounderSpecsBtn');
  const founderRetainerPanel = document.getElementById('founderRetainerPanel');
  const founderSubBadge = document.getElementById('founderSubBadge');
  const founderSubTitle = document.getElementById('founderSubTitle');
  const founderSubDesc = document.getElementById('founderSubDesc');
  const founderSubPrice = document.getElementById('founderSubPrice');
  const founderCancelSubBtn = document.getElementById('founderCancelSubBtn');
  const fBtnUpgradeLock1 = document.getElementById('fBtnUpgradeLock1');
  const fBtnUpgradeTop3 = document.getElementById('fBtnUpgradeTop3');
  const founderLeadsPanel = document.getElementById('founderLeadsPanel');
  const founderLeadsBadge = document.getElementById('founderLeadsBadge');
  const founderLeadsList = document.getElementById('founderLeadsList');
  let activeFounderTab = 'editor';
  let founderPortalData = null;

  // Admin Tab 5: Buyer RFP Leads Ledger
  const adminTabLeads = document.getElementById('adminTabLeads');
  const adminLeadsCountBadge = document.getElementById('adminLeadsCountBadge');
  const adminLeadSearchInput = document.getElementById('adminLeadSearchInput');
  const adminLeadStatusFilter = document.getElementById('adminLeadStatusFilter');
  const adminExportLeadsCsvBtn = document.getElementById('adminExportLeadsCsvBtn');
  const adminLeadsTableBody = document.getElementById('adminLeadsTableBody');

  const toastNotification = document.getElementById('toastNotification');

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(msg) {
    toastNotification.textContent = msg;
    toastNotification.classList.remove('hidden');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      toastNotification.classList.add('hidden');
    }, 3600);
  }

  function getActiveCategory() {
    if (!appState || !appState.categories) return null;
    return (
      appState.categories.find((c) => c.slug === currentCategorySlug) ||
      appState.categories[0]
    );
  }

  // =========================================================================
  // SEO & AI (SCHEMA.ORG JSON-LD + CLEAN URL ROUTING)
  // =========================================================================
  function navigateToHome(pushHistory = true) {
    currentView = 'home';
    if (pushHistory && window.location.pathname !== '/') {
      window.history.pushState({ view: 'home' }, '', '/');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    renderAll();
  }

  function navigateToCategory(slug, pushHistory = true) {
    currentCategorySlug = slug;
    currentView = 'list';
    currentTab = 'rankings';
    bumpCategoryViewCount(slug);
    const targetPath = `/list/${slug}`;
    if (pushHistory && window.location.pathname !== targetPath) {
      window.history.pushState({ view: 'list', slug }, '', targetPath);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    renderAll();
  }

  function navigateToBlog(pushHistory = true) {
    currentView = 'blog';
    if (pushHistory && window.location.pathname !== '/blog') {
      window.history.pushState({ view: 'blog' }, '', '/blog');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    renderAll();
  }

  function navigateToArticle(slug, pushHistory = true) {
    currentBlogSlug = slug;
    currentView = 'article';
    const targetPath = `/blog/${slug}`;
    if (pushHistory && window.location.pathname !== targetPath) {
      window.history.pushState({ view: 'article', slug }, '', targetPath);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    renderAll();
  }

  function navigateToAdmin(pushHistory = true) {
    currentView = 'admin';
    if (pushHistory && window.location.pathname !== '/admin') {
      window.history.pushState({ view: 'admin' }, '', '/admin');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    renderAll();
  }

  function navigateToCompare(catSlug, slugA, slugB, pushHistory = true) {
    currentCategorySlug = catSlug;
    currentCompareA = slugA;
    currentCompareB = slugB;
    currentView = 'compare';
    const targetPath = `/compare/${catSlug}/${slugA}-vs-${slugB}`;
    if (pushHistory && window.location.pathname !== targetPath) {
      window.history.pushState({ view: 'compare', catSlug, slugA, slugB }, '', targetPath);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    renderAll();
  }

  window.addEventListener('popstate', () => {
    const path = window.location.pathname;
    const listMatch = path.match(/^\/list\/([^/]+)$/);
    const blogMatch = path.match(/^\/blog\/([^/]+)$/);
    const compareMatch = path.match(/^\/compare\/([^/]+)\/([^/]+)-vs-([^/]+)$/);
    const qList = new URLSearchParams(window.location.search).get('list');

    if (compareMatch) {
      currentCategorySlug = compareMatch[1];
      currentCompareA = compareMatch[2];
      currentCompareB = compareMatch[3];
      currentView = 'compare';
    } else if (listMatch || qList) {
      currentCategorySlug = listMatch ? listMatch[1] : qList;
      currentView = 'list';
    } else if (blogMatch) {
      currentBlogSlug = blogMatch[1];
      currentView = 'article';
    } else if (path === '/blog') {
      currentView = 'blog';
    } else if (path === '/admin') {
      currentView = 'admin';
    } else {
      currentView = 'home';
    }
    renderAll();
  });

  function updateDynamicSeoHead(cat) {
    const baseUrl = window.location.origin;
    const isCompare = currentView === 'compare';
    const isList = currentView === 'list' && cat;

    let title = 'Top 10 — Independent Product Comparisons, Buying Guides & Reviews (2026)';
    let desc = 'Explore side-by-side Top 10 buying guides, comparison tables, pros & cons, pricing breakdowns, and verified user reviews.';
    let canonical = `${baseUrl}/`;

    if (isCompare) {
      const nameA = (currentCompareA || 'Product A').replace(/[_-]/g, ' ');
      const nameB = (currentCompareB || 'Product B').replace(/[_-]/g, ' ');
      title = `${nameA} vs ${nameB}: 2026 Shootout, Pricing, Specs & Verdict | Top 10`;
      desc = `In-depth head-to-head comparison of ${nameA} vs ${nameB}. Features, pricing models, developer pros & cons, and verified editorial recommendations.`;
      canonical = `${baseUrl}/compare/${currentCategorySlug}/${currentCompareA}-vs-${currentCompareB}`;
    } else if (isList) {
      title = `${cat.title} (2026) — Comparison Table, Pros & Cons, Reviews`;
      desc = `${cat.editorialGuide?.intro || cat.subtitle} Compare #1 ${cat.top10?.[0]?.name || ''} vs top alternatives.`;
      canonical = `${baseUrl}/list/${cat.slug}`;
    }

    document.title = title;
    const metaDesc = document.getElementById('metaDescriptionTag');
    if (metaDesc) metaDesc.setAttribute('content', desc);
    const canonEl = document.getElementById('canonicalLinkTag');
    if (canonEl) canonEl.setAttribute('href', canonical);

    const jsonLdEl = document.getElementById('seoJsonLdScript');
    if (jsonLdEl && isList) {
      const schemaPayload = [
        {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: `${cat.title} (2026 Buying Guide & Reviews)`,
          description: desc,
          url: canonical,
          numberOfItems: (cat.top10 || []).length,
          itemListElement: (cat.top10 || []).map((p) => ({
            '@type': 'ListItem',
            position: p.rank,
            item: {
              '@type': 'Product',
              name: p.name,
              brand: { '@type': 'Brand', name: p.companyName },
              description: p.editorialSummary || p.tagline,
              url: p.website,
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: String(p.rating || 4.8),
                bestRating: '5',
                ratingCount: String(p.reviewsCount || 250)
              }
            }
          }))
        },
        {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: (cat.editorialGuide?.faqs || []).map((f) => ({
            '@type': 'Question',
            name: f.q,
            acceptedAnswer: { '@type': 'Answer', text: f.a }
          }))
        }
      ];
      jsonLdEl.textContent = JSON.stringify(schemaPayload);
    }
  }

  // =========================================================================
  // STATE FETCH & MASTER RENDER
  // =========================================================================
  async function fetchState() {
    try {
      const res = await fetch('/api/state');
      appState = await res.json();
      if (appState.currentUser) {
        currentUser = appState.currentUser;
      } else {
        const meRes = await fetch('/api/auth/me');
        if (meRes.ok) {
          const meData = await meRes.json();
          if (meData.user) currentUser = meData.user;
        }
      }
    } catch (err) {
      console.error('Failed to load platform state:', err);
    }
    renderAll();
  }

  function renderAll() {
    if (!appState) return;
    const cat = getActiveCategory();
    if (!cat) return;
    currentCategorySlug = cat.slug;

    updateDynamicSeoHead(cat);

    // Update nav links active states
    const isAdmin = currentUser && currentUser.role === 'admin';
    if (navGuidesBtn) navGuidesBtn.classList.toggle('active', currentView === 'home' || currentView === 'list');
    if (navBlogBtn) navBlogBtn.classList.toggle('active', currentView === 'blog' || currentView === 'article');
    if (navAdminBtn) {
      navAdminBtn.classList.toggle('hidden', !isAdmin);
      navAdminBtn.style.display = isAdmin ? 'inline-flex' : 'none';
      navAdminBtn.classList.toggle('active', currentView === 'admin');
    }

    // Topbar state & View Switching
    if (currentView === 'home') {
      topCatName.textContent = `All Guides (${(appState.categories || []).length})`;
      homePageView.classList.remove('hidden');
      singleListPageView.classList.add('hidden');
      if (blogIndexSection) blogIndexSection.classList.add('hidden');
      if (blogArticleSection) blogArticleSection.classList.add('hidden');
      if (adminViewSection) adminViewSection.classList.add('hidden');
      if (compareHeadToHeadView) compareHeadToHeadView.classList.add('hidden');
      renderHomePage();
    } else if (currentView === 'blog') {
      topCatName.textContent = 'Editorial & Blog';
      homePageView.classList.add('hidden');
      singleListPageView.classList.add('hidden');
      if (blogIndexSection) blogIndexSection.classList.remove('hidden');
      if (blogArticleSection) blogArticleSection.classList.add('hidden');
      if (adminViewSection) adminViewSection.classList.add('hidden');
      if (compareHeadToHeadView) compareHeadToHeadView.classList.add('hidden');
      renderBlogIndex();
    } else if (currentView === 'article') {
      topCatName.textContent = 'Buying Guide';
      homePageView.classList.add('hidden');
      singleListPageView.classList.add('hidden');
      if (blogIndexSection) blogIndexSection.classList.add('hidden');
      if (blogArticleSection) blogArticleSection.classList.remove('hidden');
      if (adminViewSection) adminViewSection.classList.add('hidden');
      if (compareHeadToHeadView) compareHeadToHeadView.classList.add('hidden');
      renderBlogArticle(currentBlogSlug);
    } else if (currentView === 'admin') {
      if (!isAdmin) {
        currentView = 'home';
        if (loginModalBackdrop) {
          loginModalBackdrop.classList.remove('hidden');
          if (loginEmail) loginEmail.value = 'admin@top10.io';
        }
        showToast('Admin authorization required to access Command Center');
        renderHomePage();
        return;
      }
      topCatName.textContent = 'Admin Operations';
      homePageView.classList.add('hidden');
      singleListPageView.classList.add('hidden');
      if (blogIndexSection) blogIndexSection.classList.add('hidden');
      if (blogArticleSection) blogArticleSection.classList.add('hidden');
      if (adminViewSection) adminViewSection.classList.remove('hidden');
      if (compareHeadToHeadView) compareHeadToHeadView.classList.add('hidden');
      renderAdminPanel();
    } else if (currentView === 'compare') {
      topCatName.textContent = 'Head-to-Head Comparison';
      homePageView.classList.add('hidden');
      singleListPageView.classList.add('hidden');
      if (blogIndexSection) blogIndexSection.classList.add('hidden');
      if (blogArticleSection) blogArticleSection.classList.add('hidden');
      if (adminViewSection) adminViewSection.classList.add('hidden');
      if (compareHeadToHeadView) compareHeadToHeadView.classList.remove('hidden');
      renderCompareHeadToHead(currentCategorySlug, currentCompareA, currentCompareB);
    } else {
      // Single category list view
      topCatName.textContent = cat.shortName || cat.title;
      homePageView.classList.add('hidden');
      singleListPageView.classList.remove('hidden');
      if (blogIndexSection) blogIndexSection.classList.add('hidden');
      if (blogArticleSection) blogArticleSection.classList.add('hidden');
      if (adminViewSection) adminViewSection.classList.add('hidden');
      if (compareHeadToHeadView) compareHeadToHeadView.classList.add('hidden');
      renderSingleListPage(cat);
    }

    if (currentUser) {
      currentUserAvatar.textContent = currentUser.avatarText || 'U';
      currentUserAvatar.style.background = currentUser.avatarBg || '#111827';
      if (composerUserAvatar) {
        composerUserAvatar.textContent = currentUser.avatarText || 'U';
        composerUserAvatar.style.background = currentUser.avatarBg || '#111827';
      }
      if (composerPostingAs) {
        composerPostingAs.textContent = `Posting as ${currentUser.name}`;
      }
    }

    renderUserMenu();
    renderCategoryMenu();
  }

  function shortenBullet(text) {
    const clean = String(text || '').trim();
    if (clean.length <= 140) return clean;
    const cut = clean.slice(0, 135).replace(/\s+\S*$/, '');
    return `${cut}…`;
  }

  function extractDomain(urlStr) {
    try {
      const normalized = /^https?:\/\//i.test(urlStr) ? urlStr : `https://${urlStr}`;
      return new URL(normalized).hostname.replace(/^www\./i, '');
    } catch {
      return '';
    }
  }

  function renderBrandLogo(prod, size = 20) {
    const domain = extractDomain(prod.website || '');
    const fallbackLetter = escapeHtml(prod.logoText || (prod.name || 'P')[0].toUpperCase());
    const bg = escapeHtml(prod.logoBg || '#111827');
    const color = escapeHtml(prod.logoColor || '#FFFFFF');
    if (!domain) {
      return `<span class="prod-mini-logo" style="width:${size}px;height:${size}px;background:${bg};color:${color};">${fallbackLetter}</span>`;
    }
    const faviconUrl = `/api/favicon?domain=${encodeURIComponent(domain)}&text=${encodeURIComponent(fallbackLetter)}&bg=${encodeURIComponent(prod.logoBg || '#111827')}&color=${encodeURIComponent(prod.logoColor || '#FFFFFF')}`;
    return `
      <span class="prod-favicon-wrap" style="width:${size}px;height:${size}px;background:${bg};color:${color};">
        <img src="${faviconUrl}" alt="" class="prod-favicon-img" loading="lazy" />
        <span class="prod-favicon-fallback" style="display:none;">${fallbackLetter}</span>
      </span>
    `;
  }

  // Monochrome 13px SVG Line Icons (Replacing Emojis)
  const SVG_ICON_PRICE = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="3.5" width="13" height="9" rx="1.8"/><path d="M1.5 6.8h13"/></svg>`;
  const SVG_ICON_TRIAL = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v12M2.5 5.5h11M4 2h8l1.5 3.5v7A1.5 1.5 0 0112 14H4a1.5 1.5 0 01-1.5-1.5v-7L4 2z"/></svg>`;
  const SVG_ICON_USERS = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="5.5" r="2.5"/><path d="M2 13c0-2.2 1.8-4 4-4s4 1.8 4 4"/><circle cx="11.5" cy="6" r="2"/><path d="M14.5 13c0-1.7-1.2-3.1-2.8-3.4"/></svg>`;
  const SVG_ICON_THUMB = `<svg width="12.5" height="12.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7v6H2.5a1 1 0 01-1-1V8a1 1 0 011-1H5zm0 0l2.6-4.4A1.2 1.2 0 019.8 3.2L9.2 6.5h4.1a1.5 1.5 0 011.47 1.8l-.9 4.5a1.5 1.5 0 01-1.47 1.2H5"/></svg>`;
  const SVG_ICON_VERIFIED = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#10B981" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M13.2 4.8L6.5 11.5 2.8 7.8"/></svg>`;
  const SVG_ICON_BOOKMARK = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2.5h8a1 1 0 011 1v10l-5-3-5 3v-10a1 1 0 011-1z"/></svg>`;
  const SVG_ICON_BADGE = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5.2 5.2L2.2 8l3 2.8M10.8 5.2l3 2.8-3 2.8M9 3.5L7 12.5"/></svg>`;

  // Crisp Monochrome SVG Category Icons (Replacing Random Single Letters m, s, a, c, h)
  function renderCategorySvgIcon(cat, svgSize = 16) {
    const slug = (cat && cat.slug) || '';
    if (slug.includes('billing') || slug.includes('payment') || slug.includes('finance')) {
      return `<svg width="${svgSize}" height="${svgSize}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="3" width="13" height="10" rx="2"/><path d="M1.5 6.5h13M4.5 10h2.5"/></svg>`;
    }
    if (slug.includes('speaker') || slug.includes('audio') || slug.includes('sound')) {
      return `<svg width="${svgSize}" height="${svgSize}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="1.5" width="10" height="13" rx="2"/><circle cx="8" cy="10" r="2.3"/><circle cx="8" cy="4.8" r="0.8" fill="currentColor"/></svg>`;
    }
    if (slug.includes('coding') || slug.includes('dev') || slug.includes('code')) {
      return `<svg width="${svgSize}" height="${svgSize}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5.2 4.8L2 8l3.2 3.2M10.8 4.8L14 8l-3.2 3.2M9.2 3.2L6.8 12.8"/></svg>`;
    }
    if (slug.includes('crm') || slug.includes('sales') || slug.includes('customer')) {
      return `<svg width="${svgSize}" height="${svgSize}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="5.2" r="2.3"/><path d="M2 13c0-2.1 1.8-3.8 4-3.8s4 1.7 4 3.8"/><circle cx="11.5" cy="5.8" r="1.8"/><path d="M14.3 13c0-1.6-1.1-2.9-2.6-3.3"/></svg>`;
    }
    if (slug.includes('cloud') || slug.includes('hosting') || slug.includes('server')) {
      return `<svg width="${svgSize}" height="${svgSize}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5h7.2a2.8 2.8 0 00.4-5.57A4.2 4.2 0 004 5.8a3.2 3.2 0 00.5 6.7z"/></svg>`;
    }
    if (slug.includes('project') || slug.includes('task') || slug.includes('roadmap')) {
      return `<svg width="${svgSize}" height="${svgSize}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M6 2v12M10 2v12M2 6.5h12"/></svg>`;
    }
    if (slug.includes('email') || slug.includes('newsletter') || slug.includes('marketing')) {
      return `<svg width="${svgSize}" height="${svgSize}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="3" width="13" height="10" rx="2"/><path d="M2 4l6 4.5L14 4"/></svg>`;
    }
    if (slug.includes('video') || slug.includes('media') || slug.includes('film')) {
      return `<svg width="${svgSize}" height="${svgSize}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="3" width="9.5" height="10" rx="1.8"/><path d="M11 6.5l3.5-2v7L11 9.5"/></svg>`;
    }
    if (slug.includes('oven')) {
      return `<svg width="${svgSize}" height="${svgSize}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="12" height="12" rx="2"/><circle cx="5" cy="4.8" r="0.8" fill="currentColor"/><circle cx="8" cy="4.8" r="0.8" fill="currentColor"/><circle cx="11" cy="4.8" r="0.8" fill="currentColor"/><rect x="3.8" y="7.5" width="8.4" height="4.5" rx="1"/></svg>`;
    }
    if (slug.includes('tv')) {
      return `<svg width="${svgSize}" height="${svgSize}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="12" height="8.5" rx="1.5"/><path d="M6 14h4M8 11.5v2.5M5.5 1.5l2.5 1.5 2.5-1.5"/></svg>`;
    }
    if (slug.includes('cover') || slug.includes('phone')) {
      return `<svg width="${svgSize}" height="${svgSize}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="1.8" width="8" height="12.4" rx="2"/><circle cx="8" cy="11.5" r="0.75" fill="currentColor"/><path d="M6.5 3.5h3"/></svg>`;
    }
    if (slug.includes('gambling') || slug.includes('casino') || slug.includes('bet')) {
      return `<svg width="${svgSize}" height="${svgSize}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="2.5" width="11" height="11" rx="2.2"/><circle cx="5.5" cy="5.5" r="0.9" fill="currentColor"/><circle cx="10.5" cy="5.5" r="0.9" fill="currentColor"/><circle cx="8" cy="8" r="0.9" fill="currentColor"/><circle cx="5.5" cy="10.5" r="0.9" fill="currentColor"/><circle cx="10.5" cy="10.5" r="0.9" fill="currentColor"/></svg>`;
    }
    if (slug.includes('game') || slug.includes('gaming')) {
      return `<svg width="${svgSize}" height="${svgSize}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 3.2h7l2.5 7.6a2 2 0 01-2.5 2.2l-2.2-.8a2 2 0 00-1.6 0l-2.2.8a2 2 0 01-2.5-2.2L4.5 3.2z"/><path d="M4.5 6.5h3M6 5v3M10 6h.5M11.5 7.5h.5"/></svg>`;
    }
    if (slug.includes('audiobook') || slug.includes('book')) {
      return `<svg width="${svgSize}" height="${svgSize}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 13.5A2.5 2.5 0 015 11h8.5v3H5a2.5 2.5 0 01-2.5-2.5z"/><path d="M5 2.5h8.5v8.5H5A2.5 2.5 0 002.5 13.5V5A2.5 2.5 0 015 2.5z"/><circle cx="8.5" cy="6.5" r="1.5"/><path d="M8.5 8v2"/></svg>`;
    }
    return `<svg width="${svgSize}" height="${svgSize}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polygon points="8 1.8 9.9 5.7 14.2 6.3 11.1 9.3 11.8 13.6 8 11.6 4.2 13.6 4.9 9.3 1.8 6.3 6.1 5.7 8 1.8"/></svg>`;
  }

  // =========================================================================
  // MINIMALIST HOMEPAGE RENDERER + INSTANT LIVE SEARCH DROPDOWN
  // =========================================================================
  function renderHomePage() {
    const rawQuery = (homeBigSearchInput.value || '').trim();
    const q = rawQuery.toLowerCase();

    clearBigSearchBtn.classList.toggle('hidden', !rawQuery);
    if (searchKbdBadge) {
      searchKbdBadge.classList.toggle('hidden', Boolean(rawQuery) || document.activeElement === homeBigSearchInput);
    }

    const allCats = appState.categories || [];

    const matchedCats = allCats.filter((c) => {
      if (!q) return true;
      const inTitle =
        c.title.toLowerCase().includes(q) ||
        (c.shortName || '').toLowerCase().includes(q) ||
        (c.editorialGuide?.intro || '').toLowerCase().includes(q);
      const inProducts = (c.top10 || []).some(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.bestFor || '').toLowerCase().includes(q) ||
          (p.tagline || '').toLowerCase().includes(q)
      );
      return inTitle || inProducts;
    });

    // Render Instant Live Search Dropdown (Directories + Specific Platforms)
    if (homeLiveSearchDropdown) {
      if (!q) {
        homeLiveSearchDropdown.classList.add('hidden');
        homeLiveSearchDropdown.innerHTML = '';
      } else {
        const prodMatches = [];
        allCats.forEach((c) => {
          [...(c.top10 || []), ...(c.pushedOut || [])].forEach((p) => {
            if (
              p.name.toLowerCase().includes(q) ||
              (p.companyName || '').toLowerCase().includes(q) ||
              (p.tagline || '').toLowerCase().includes(q)
            ) {
              prodMatches.push({ prod: p, cat: c });
            }
          });
        });

        const topCats = matchedCats.slice(0, 3);
        const topProds = prodMatches.slice(0, 5);
        const matchedArticles = (appState.articles || [])
          .filter((a) => a.title.toLowerCase().includes(q) || (a.subtitle || '').toLowerCase().includes(q))
          .slice(0, 3);

        if (topCats.length === 0 && topProds.length === 0 && matchedArticles.length === 0) {
          homeLiveSearchDropdown.classList.add('hidden');
          homeLiveSearchDropdown.innerHTML = '';
        } else {
          let dropdownHtml = '';
          if (topCats.length > 0) {
            dropdownHtml += `<div class="lsd-section-label">Directories</div>`;
            dropdownHtml += topCats
              .map(
                (c) => `
                <button type="button" class="lsd-item" data-lsd-cat="${escapeHtml(c.slug)}">
                  <span class="lsd-item-left">
                    <span class="entity-logo-lg" style="width:22px;height:22px;border-radius:6px;background:${escapeHtml(c.iconBg)};color:${escapeHtml(c.iconColor)};">${renderCategorySvgIcon(c, 13)}</span>
                    <strong>${escapeHtml(c.title)}</strong>
                  </span>
                  <span class="lsd-item-meta">${escapeHtml(formatBumpedViews(c.metrics?.monthlyViews, c.slug))} views →</span>
                </button>
              `
              )
              .join('');
          }
          if (topProds.length > 0) {
            dropdownHtml += `<div class="lsd-section-label">Platforms</div>`;
            dropdownHtml += topProds
              .map(
                ({ prod, cat }) => `
                <button type="button" class="lsd-item" data-lsd-prod="${escapeHtml(prod.id)}" data-lsd-cat="${escapeHtml(cat.slug)}">
                  <span class="lsd-item-left">
                    ${renderBrandLogo(prod, 20)}
                    <strong>${escapeHtml(prod.name)}</strong>
                    <span class="lsd-sub-company">in ${escapeHtml(cat.title)}</span>
                  </span>
                  <span class="lsd-item-meta">${escapeHtml(prod.pricingTag)} →</span>
                </button>
              `
              )
              .join('');
          }

          if (matchedArticles.length > 0) {
            dropdownHtml += `<div class="lsd-section-label">Buying Guides &amp; Teardowns</div>`;
            dropdownHtml += matchedArticles
              .map(
                (a) => `
                <button type="button" class="lsd-item" data-home-lsd-article="${escapeHtml(a.slug)}">
                  <span class="lsd-item-left">
                    <span class="entity-logo-lg" style="width:22px;height:22px;border-radius:6px;background:#111827;color:#FFF;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;">📖</span>
                    <strong>${escapeHtml(a.title)}</strong>
                  </span>
                  <span class="lsd-item-meta">${escapeHtml(a.readTime)} →</span>
                </button>
              `
              )
              .join('');
          }

          homeLiveSearchDropdown.innerHTML = dropdownHtml;
          homeLiveSearchDropdown.classList.remove('hidden');

          homeLiveSearchDropdown.querySelectorAll('[data-home-lsd-article]').forEach((btn) => {
            btn.addEventListener('click', () => {
              const slug = btn.getAttribute('data-home-lsd-article');
              homeLiveSearchDropdown.classList.add('hidden');
              navigateToArticle(slug);
            });
          });

          homeLiveSearchDropdown.querySelectorAll('[data-lsd-cat]').forEach((btn) => {
            btn.addEventListener('click', () => {
              const targetCat = btn.getAttribute('data-lsd-cat');
              const targetProd = btn.getAttribute('data-lsd-prod');
              homeLiveSearchDropdown.classList.add('hidden');
              activeQuickFilter = 'all';
              navigateToCategory(targetCat);
              if (targetProd) {
                setTimeout(() => {
                  const cardEl = document.getElementById(`prod-card-${targetProd}`);
                  if (cardEl) {
                    cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    cardEl.classList.add('flash-highlight');
                    setTimeout(() => cardEl.classList.remove('flash-highlight'), 1800);
                  }
                }, 80);
              }
            });
          });
        }
      }
    }

    const formattedSearchListTitle = rawQuery
      ? rawQuery.toLowerCase().startsWith('top 10')
        ? rawQuery
        : `Top 10 ${rawQuery}`
      : 'Top 10 Custom Category';

    if (rawQuery && matchedCats.length === 0) {
      searchNotFoundPaywall.classList.remove('hidden');
      nfHeadingText.textContent = `We haven't published "${formattedSearchListTitle}" yet.`;
      nfListNameStrong.textContent = formattedSearchListTitle;
      nfBtnLabelSpan.textContent = formattedSearchListTitle;
      homeGridHeading.textContent = 'Other Top 10 Directories';
    } else {
      searchNotFoundPaywall.classList.add('hidden');
      homeGridHeading.textContent = rawQuery
        ? `Matching Directories (${matchedCats.length})`
        : `Top 10 Directories (${allCats.length})`;
    }

    const displayList = matchedCats.length > 0 ? matchedCats : allCats;

    homeListsGrid.innerHTML = displayList
      .map((c) => {
        const top3 = (c.top10 || []).slice(0, 3);

        const top3Html = top3
          .map(
            (p) => `
            <div class="hlc-preview-item">
              <span style="display:flex;align-items:center;gap:7px;min-width:0;">
                ${renderBrandLogo(p, 18)}
                <strong style="color:var(--text-main);white-space:nowrap;">${escapeHtml(p.name)}</strong>
              </span>
              <span style="color:var(--text-muted);font-size:11.5px;flex-shrink:0;">${escapeHtml(p.pricingTag)}</span>
            </div>
          `
          )
          .join('');

        return `
          <article class="home-list-card" data-open-list="${escapeHtml(c.slug)}" data-cat-card-slug="${escapeHtml(c.slug)}">
            <div class="hlc-header">
              <div class="hlc-title-row">
                <span class="entity-logo-lg" style="width:32px;height:32px;background:${escapeHtml(c.iconBg)};color:${escapeHtml(c.iconColor)};">
                  ${renderCategorySvgIcon(c, 16)}
                </span>
                <div>
                  <h3 class="hlc-title">${escapeHtml(c.title)}</h3>
                  <div class="hlc-meta">${escapeHtml(formatBumpedViews(c.metrics?.monthlyViews, c.slug))} views</div>
                </div>
              </div>
              <span class="hlc-open-link">Open →</span>
            </div>

            <div class="hlc-top3-preview">
              ${top3Html}
            </div>
          </article>
        `;
      })
      .join('');

    homeListsGrid.querySelectorAll('[data-open-list]').forEach((card) => {
      card.addEventListener('click', () => {
        activeQuickFilter = 'all';
        navigateToCategory(card.getAttribute('data-open-list'));
      });
    });
  }

  // Helper to test quick filter match on a product
  function matchesQuickFilter(prod, filterKey) {
    if (!filterKey || filterKey === 'all') return true;
    if (filterKey === 'saved') {
      return savedProductIds.has(prod.id);
    }
    const hay = `${prod.pricingTag || ''} ${prod.specs?.startingPrice || ''} ${prod.specs?.freeTrial || ''} ${prod.specs?.idealFor || ''} ${prod.specs?.deployment || ''} ${prod.tagline || ''} ${prod.editorialSummary || ''}`.toLowerCase();
    if (filterKey === 'free') {
      return hay.includes('free') || hay.includes('$0') || hay.includes('sandbox') || hay.includes('open-source') || hay.includes('open source');
    }
    if (filterKey === 'api') {
      return hay.includes('api') || hay.includes('sdk') || hay.includes('cloud') || hay.includes('webhook') || hay.includes('developer');
    }
    if (filterKey === 'enterprise') {
      return hay.includes('enterprise') || hay.includes('scale') || hay.includes('global') || hay.includes('b2b') || hay.includes('custom');
    }
    return true;
  }

  // Bulletproof Clipboard Copy Helper with ExecCommand Fallback
  async function copyTextWithFallback(text, inputEl) {
    if (!text) return false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}
    if (inputEl) {
      try {
        inputEl.focus();
        inputEl.select();
        const successful = document.execCommand('copy');
        if (successful) return true;
      } catch {}
    }
    const temp = document.createElement('textarea');
    temp.value = text;
    temp.style.position = 'fixed';
    temp.style.opacity = '0';
    temp.style.pointerEvents = 'none';
    document.body.appendChild(temp);
    temp.focus();
    temp.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {}
    document.body.removeChild(temp);
    return copied;
  }

  // Helper: Open 1-Click "Ranked on Top 10" Embed Badge Modal for Founders
  function openEmbedBadgeModal(cat, prod) {
    if (!badgeModalBackdrop || !cat || !prod) return;
    const origin = window.location.origin;
    const badgeUrl = `${origin}/api/badge/${cat.slug}/${prod.id}.svg`;
    const listUrl = `${origin}/list/${cat.slug}`;
    const rankNum = prod.rank || 1;
    if (badgeModalCategoryEyebrow) badgeModalCategoryEyebrow.textContent = `${cat.title} · Rank #${rankNum} Badge`;
    if (badgeModalTitle) badgeModalTitle.textContent = `Embed "${prod.name}" Badge`;
    if (badgePreviewImg) {
      badgePreviewImg.src = badgeUrl;
      badgePreviewImg.alt = `${prod.name} Ranked #${rankNum} on Top 10`;
    }

    const htmlSnippet = `<a href="${listUrl}" target="_blank" rel="noopener" title="${escapeHtml(prod.name)} — Ranked #${rankNum} on Top 10 ${escapeHtml(cat.title)}"><img src="${badgeUrl}" alt="${escapeHtml(prod.name)} — Ranked #${rankNum} on Top 10" width="250" height="54" style="border:0;height:54px;width:250px;" /></a>`;
    const mdSnippet = `[![${prod.name} — Ranked #${rankNum} on Top 10](${badgeUrl})](${listUrl})`;

    if (badgeHtmlCode) badgeHtmlCode.value = htmlSnippet;
    if (badgeMarkdownCode) badgeMarkdownCode.value = mdSnippet;
    badgeModalBackdrop.classList.remove('hidden');
  }

  // Helper: Open On-Demand "Compare Saved Platforms" Modal
  function openCompareSavedModal(cat) {
    if (!compareSavedModalBackdrop || !compareSavedGrid || !cat) return;
    const allProds = [...(cat.top10 || []), ...(cat.pushedOut || [])];
    const savedList = allProds.filter((p) => savedProductIds.has(p.id));
    if (savedList.length < 2) {
      showToast('Save at least 2 platforms to compare side-by-side');
      return;
    }

    if (compareModalEyebrow) compareModalEyebrow.textContent = `${cat.title} · ${savedList.length} Shortlisted`;
    if (compareModalTitle) compareModalTitle.textContent = `Side-by-Side Comparison (${savedList.length})`;

    compareSavedGrid.innerHTML = savedList
      .map((prod) => {
        const specs = prod.specs || {};
        const prosHtml = (prod.pros || [])
          .slice(0, 2)
          .map((p) => `<li><span class="pc-icon-pro">✓</span> <span>${escapeHtml(shortenBullet(p))}</span></li>`)
          .join('');
        const consHtml = (prod.cons || [])
          .slice(0, 2)
          .map((c) => `<li><span class="pc-icon-con">✗</span> <span>${escapeHtml(shortenBullet(c))}</span></li>`)
          .join('');

        return `
          <div class="compare-saved-col">
            <div class="csc-header">
              <div class="csc-brand">
                ${renderBrandLogo(prod, 24)}
                <div>
                  <div class="csc-name">${escapeHtml(prod.name)}</div>
                  <div class="csc-company">by ${escapeHtml(prod.companyName)}</div>
                </div>
              </div>
              <button type="button" class="csc-remove-btn" data-csc-unsave="${escapeHtml(prod.id)}" title="Remove from shortlist">&times;</button>
            </div>

            <p class="csc-desc">${escapeHtml(prod.editorialSummary || prod.tagline)}</p>

            <div class="csc-specs">
              <div class="csc-spec-row">
                <span>Starting Price</span>
                <strong>${escapeHtml(specs.startingPrice || prod.pricingTag)}</strong>
              </div>
              <div class="csc-spec-row">
                <span>Free Trial / Tier</span>
                <strong>${escapeHtml(specs.freeTrial || 'Free trial')}</strong>
              </div>
              <div class="csc-spec-row">
                <span>Ideal For</span>
                <strong>${escapeHtml(specs.idealFor || 'Modern Teams')}</strong>
              </div>
              <div class="csc-spec-row">
                <span>Deployment</span>
                <strong>${escapeHtml(specs.deployment || 'Cloud + API')}</strong>
              </div>
            </div>

            <div class="csc-pros-cons">
              <ul class="pc-list">${prosHtml}</ul>
              <ul class="pc-list" style="margin-top:6px;">${consHtml}</ul>
            </div>

            <a href="${escapeHtml(prod.website)}" target="_blank" rel="noopener" class="btn-reader-visit csc-visit-btn" data-click-prod="${escapeHtml(prod.id)}">
              Visit ${escapeHtml(prod.name)} ↗
            </a>
          </div>
        `;
      })
      .join('');

    compareSavedGrid.querySelectorAll('[data-csc-unsave]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pid = btn.getAttribute('data-csc-unsave');
        savedProductIds.delete(pid);
        persistSavedProducts();
        renderSingleListPage(cat);
        const remaining = allProds.filter((p) => savedProductIds.has(p.id));
        if (remaining.length < 2) {
          compareSavedModalBackdrop.classList.add('hidden');
        } else {
          openCompareSavedModal(cat);
        }
      });
    });

    compareSavedModalBackdrop.classList.remove('hidden');
  }

  // Helper: Open High-Res Product Image Lightbox Modal
  function openImageLightbox(src, title, tag, comp, link) {
    if (!imageLightboxModalBackdrop || !lightboxLargeImg) return;
    const cat = getActiveCategory();
    if (lightboxModalEyebrow) lightboxModalEyebrow.textContent = `${cat ? cat.title : 'Product'} · Studio Showcase`;
    if (lightboxModalTitle) lightboxModalTitle.textContent = title || 'Product Photo';
    lightboxLargeImg.src = src;
    lightboxLargeImg.alt = title || 'Product Photo';
    if (lightboxSpecTag) {
      if (tag) {
        lightboxSpecTag.textContent = tag;
        lightboxSpecTag.classList.remove('hidden');
      } else {
        lightboxSpecTag.classList.add('hidden');
      }
    }
    if (lightboxCaption) {
      lightboxCaption.textContent = comp ? `${title} by ${comp}` : (title || '');
    }
    if (lightboxVisitBtn) {
      lightboxVisitBtn.href = link || '#';
    }
    imageLightboxModalBackdrop.classList.remove('hidden');
  }

  // Synchronous SVG Sparkline updater (synchronizes path d AND all 6 circle nodes!)
  function updateSparklinePoints(svgEl, yValues, strokeColor) {
    if (!svgEl || !Array.isArray(yValues) || yValues.length !== 6) return;
    const xCoords = [4, 20, 36, 52, 68, 84];
    const pathD = `M4 ${yValues[0]}L20 ${yValues[1]}L36 ${yValues[2]}L52 ${yValues[3]}L68 ${yValues[4]}L84 ${yValues[5]}`;
    const p = svgEl.querySelector('path');
    if (p) {
      p.setAttribute('d', pathD);
      if (strokeColor) p.setAttribute('stroke', strokeColor);
    }
    const circles = svgEl.querySelectorAll('circle');
    circles.forEach((c, idx) => {
      if (idx < yValues.length) {
        c.setAttribute('cx', String(xCoords[idx]));
        c.setAttribute('cy', String(yValues[idx]));
        if (strokeColor) c.setAttribute('fill', strokeColor);
      }
    });
  }

  // Thematic Clusters for Contextually Relevant Recommendations
  const THEMATIC_CLUSTERS = {
    software: [
      'billing-software',
      'crm-platforms',
      'cloud-hosting',
      'ai-coding-tools',
      'email-marketing',
      'project-management',
      'ai-video-generators'
    ],
    hardware: ['smart-tvs', 'ovens', 'studio-speakers', 'phone-covers'],
    lifestyle: ['mobile-games', 'audiobook-apps', 'gambling-platforms']
  };

  function getThematicRelatedCategories(cat, allCats) {
    const currentSlug = cat.slug;
    let matchedClusterKey = null;
    for (const [key, slugs] of Object.entries(THEMATIC_CLUSTERS)) {
      if (slugs.includes(currentSlug)) {
        matchedClusterKey = key;
        break;
      }
    }

    const others = [];
    if (matchedClusterKey) {
      const clusterSlugs = THEMATIC_CLUSTERS[matchedClusterKey];
      for (const slug of clusterSlugs) {
        if (slug !== currentSlug) {
          const found = allCats.find((c) => c.slug === slug);
          if (found && !others.some((o) => o.slug === found.slug)) {
            others.push(found);
            if (others.length >= 3) break;
          }
        }
      }
    }

    if (others.length < 3) {
      const sortedByViews = allCats
        .filter((c) => c.slug !== currentSlug && !others.some((o) => o.slug === c.slug))
        .slice()
        .sort((a, b) => {
          const aViews = parseFloat(String(a.metrics?.monthlyViews || '0').replace(/[^0-9.]/g, '')) || 0;
          const bViews = parseFloat(String(b.metrics?.monthlyViews || '0').replace(/[^0-9.]/g, '')) || 0;
          return bViews - aViews;
        });

      for (const c of sortedByViews) {
        others.push(c);
        if (others.length >= 3) break;
      }
    }

    return others.slice(0, 3);
  }

  // Helper: Render Interactive 7D / 30D / 1Y Analytics State
  function renderAnalyticsRange(cat) {
    if (!cat) return;
    const guide = cat.editorialGuide || {};
    const top10 = cat.top10 || [];
    const pushedOut = cat.pushedOut || [];
    const totalListings = cat.totalListingsCount || top10.length + pushedOut.length;

    const raw30dViews = formatBumpedViews(cat.metrics?.monthlyViews || '130.53k', cat.slug);
    const baseNumK = parseFloat(raw30dViews.replace(/[^0-9.]/g, '')) || 130.53;
    const raw30dReviews = parseInt(String(guide.totalVerifiedReviews || '6,723').replace(/[^0-9]/g, ''), 10) || 6723;

    if (analyticsRangeTabs) {
      analyticsRangeTabs.querySelectorAll('[data-range]').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-range') === activeAnalyticsRange);
      });
    }

    if (activeAnalyticsRange === '7d') {
      if (kpiViews) kpiViews.textContent = `${(baseNumK * 0.26).toFixed(2)}k`;
      if (kpiReviews) kpiReviews.textContent = Math.round(raw30dReviews * 0.24).toLocaleString();
      if (kpiTotalListings) kpiTotalListings.textContent = `${totalListings}`;
      if (trendViewsPill) {
        trendViewsPill.textContent = '+6.4%';
        trendViewsPill.className = 'asc-trend-pill up';
      }
      if (trendReviewsPill) {
        trendReviewsPill.textContent = '+4.8%';
        trendReviewsPill.className = 'asc-trend-pill blue';
      }
      if (trendListingsPill) {
        trendListingsPill.textContent = '+1 Live';
        trendListingsPill.className = 'asc-trend-pill purple';
      }
      updateSparklinePoints(sparkViewsSvg, [25, 23, 19, 21, 13, 9], '#10B981');
      updateSparklinePoints(sparkReviewsSvg, [24, 22, 18, 17, 14, 10], '#0EA5E9');
      updateSparklinePoints(sparkListingsSvg, [26, 24, 22, 19, 16, 12], '#8B5CF6');
    } else if (activeAnalyticsRange === '1y') {
      if (kpiViews) kpiViews.textContent = `${(baseNumK * 11.4).toFixed(1)}k`;
      if (kpiReviews) kpiReviews.textContent = Math.round(raw30dReviews * 3.8).toLocaleString();
      if (kpiTotalListings) kpiTotalListings.textContent = `${totalListings}`;
      if (trendViewsPill) {
        trendViewsPill.textContent = '+142%';
        trendViewsPill.className = 'asc-trend-pill up';
      }
      if (trendReviewsPill) {
        trendReviewsPill.textContent = '+89%';
        trendReviewsPill.className = 'asc-trend-pill blue';
      }
      if (trendListingsPill) {
        trendListingsPill.textContent = '+4 Net';
        trendListingsPill.className = 'asc-trend-pill purple';
      }
      updateSparklinePoints(sparkViewsSvg, [30, 26, 22, 16, 10, 4], '#10B981');
      updateSparklinePoints(sparkReviewsSvg, [29, 24, 20, 15, 11, 5], '#0EA5E9');
      updateSparklinePoints(sparkListingsSvg, [28, 25, 21, 15, 11, 6], '#8B5CF6');
    } else {
      // Default 30D
      if (kpiViews) kpiViews.textContent = raw30dViews;
      if (kpiReviews) kpiReviews.textContent = raw30dReviews.toLocaleString();
      if (kpiTotalListings) kpiTotalListings.textContent = `${totalListings}`;
      if (trendViewsPill) {
        trendViewsPill.textContent = '+18%';
        trendViewsPill.className = 'asc-trend-pill up';
      }
      if (trendReviewsPill) {
        trendReviewsPill.textContent = '+12%';
        trendReviewsPill.className = 'asc-trend-pill blue';
      }
      if (trendListingsPill) {
        trendListingsPill.textContent = 'Live';
        trendListingsPill.className = 'asc-trend-pill purple';
      }
      updateSparklinePoints(sparkViewsSvg, [28, 21, 24, 14, 16, 6], '#10B981');
      updateSparklinePoints(sparkReviewsSvg, [26, 18, 15, 22, 12, 8], '#0EA5E9');
      updateSparklinePoints(sparkListingsSvg, [27, 23, 20, 13, 15, 7], '#8B5CF6');
    }
  }

  // Helper: Render 3 Related Top 10 Directories at Page Bottom
  function renderRelatedDirectories(cat) {
    if (!relatedDirectoriesGrid || !appState || !appState.categories) return;
    const allCats = appState.categories || [];
    if (viewAllDirectoriesFooterBtn) {
      viewAllDirectoriesFooterBtn.textContent = `View all ${allCats.length} directories →`;
    }
    const others = getThematicRelatedCategories(cat, allCats);

    relatedDirectoriesGrid.innerHTML = others
      .map((c) => {
        const top2 = (c.top10 || []).slice(0, 2);
        const top2Names = top2.map((p) => escapeHtml(p.name)).join(' · ');
        return `
          <article class="related-dir-card" data-open-rel-cat="${escapeHtml(c.slug)}">
            <div class="rdc-top">
              <span class="entity-logo-lg" style="width:28px;height:28px;border-radius:7px;background:${escapeHtml(c.iconBg)};color:${escapeHtml(c.iconColor)};">
                ${renderCategorySvgIcon(c, 14)}
              </span>
              <span class="rdc-views">${escapeHtml(formatBumpedViews(c.metrics?.monthlyViews, c.slug))} views</span>
            </div>
            <h3 class="rdc-title">${escapeHtml(c.title)}</h3>
            <div class="rdc-sub">${top2Names}</div>
          </article>
        `;
      })
      .join('');

    relatedDirectoriesGrid.querySelectorAll('[data-open-rel-cat]').forEach((card) => {
      card.addEventListener('click', () => {
        const targetSlug = card.getAttribute('data-open-rel-cat');
        activeQuickFilter = 'all';
        navigateToCategory(targetSlug);
      });
    });
  }

  // =========================================================================
  // ULTRA-MINIMALIST SINGLE LIST PAGE RENDERER
  // =========================================================================
  function renderSingleListPage(cat) {
    const guide = cat.editorialGuide || {};
    const top10 = cat.top10 || [];
    const pushedOut = cat.pushedOut || [];
    const totalListings = cat.totalListingsCount || top10.length + pushedOut.length;

    if (breadcrumbCurrentTitle) breadcrumbCurrentTitle.textContent = cat.title;
    heroCatIcon.innerHTML = renderCategorySvgIcon(cat, 18);
    heroCatIcon.style.background = cat.iconBg || '#B8FF01';
    heroCatIcon.style.color = cat.iconColor || '#111827';
    if (heroUpdatedAgo) heroUpdatedAgo.textContent = `Updated ${guide.lastUpdatedDate || 'Oct 2026'}`;
    if (heroPaidBadge) heroPaidBadge.textContent = `${totalListings} Listed`;
    heroCatTitle.textContent = cat.title;
    heroCatSubtitle.textContent = `Updated ${guide.lastUpdatedDate || 'Oct 2026'}`;

    // Count saved platforms in this category
    const allCatProds = [...top10, ...pushedOut];
    const savedInCatCount = allCatProds.filter((p) => savedProductIds.has(p.id)).length;
    if (activeQuickFilter === 'saved' && savedInCatCount === 0) {
      activeQuickFilter = 'all';
    }

    // Toggle Floating "Compare Saved (2+)" Pill
    if (compareSavedPill && compareSavedPillText) {
      if (currentView === 'list' && savedInCatCount >= 2) {
        compareSavedPillText.textContent = `Compare ${savedInCatCount} Saved →`;
        compareSavedPill.classList.remove('hidden');
      } else {
        compareSavedPill.classList.add('hidden');
      }
    }

    // Render 1-Line Quick Filter Chip Bar
    if (listQuickFilterBar) {
      const filters = [
        { key: 'all', label: `All (${top10.length})` },
        { key: 'free', label: 'Free Tier / Sandbox' },
        { key: 'api', label: 'API & Cloud' },
        { key: 'enterprise', label: 'Scale & Enterprise' },
        { key: 'saved', label: `Saved (${savedInCatCount})` }
      ];
      listQuickFilterBar.innerHTML = filters
        .map(
          (f) => `
          <button type="button" class="quick-filter-chip ${activeQuickFilter === f.key ? 'active' : ''}" data-qfilter="${f.key}">
            ${escapeHtml(f.label)}
          </button>
        `
        )
        .join('');

      listQuickFilterBar.querySelectorAll('[data-qfilter]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const targetFilter = btn.getAttribute('data-qfilter');
          if (targetFilter === 'saved' && savedInCatCount === 0) {
            showToast('Click the bookmark icon on any card to save it first');
            return;
          }
          activeQuickFilter = targetFilter;
          renderSingleListPage(cat);
        });
      });
    }

    // Render Analytics Card (7D / 30D / 1Y)
    renderAnalyticsRange(cat);
    if (commentCountBadge) commentCountBadge.textContent = (cat.comments || []).length;

    const filteredTop10 = top10.filter((p) => matchesQuickFilter(p, activeQuickFilter));
    const displayTop10 = filteredTop10.length > 0 ? filteredTop10 : top10;

    // 1. Render Unified High-End Product Cards with Real Favicons, Rank Pedigree, Badges & Micro-Toolbar
    top10TimelineList.innerHTML = displayTop10
      .map((prod, idx) => {
        const rankNum = prod.rank || (idx + 1);
        const rankClass = rankNum === 1 ? 'rank-1' : rankNum === 2 ? 'rank-2' : rankNum === 3 ? 'rank-3' : '';
        const editorialScore = Number(prod.editorialScore || (10 - (rankNum - 1) * 0.14)).toFixed(1);
        const rating = Number(prod.rating || (4.95 - (rankNum - 1) * 0.05)).toFixed(1);
        const reviewsCount = Number(prod.reviewsCount || (prod.upvotes || 80) * 4 + (11 - rankNum) * 40);
        const reviewsFormatted = reviewsCount >= 1000 ? (reviewsCount / 1000).toFixed(1) + 'k' : reviewsCount;

        const prosList = Array.isArray(prod.pros) && prod.pros.length > 0 ? prod.pros : [];
        const consList = Array.isArray(prod.cons) && prod.cons.length > 0 ? prod.cons : [];

        const prosHtml = (prosList.length > 0 ? prosList : ['Verified production reliability and fast team onboarding', 'Transparent pricing structure with low operational overhead'])
          .slice(0, 3)
          .map(
            (pro) => `
            <li class="pc-bullet-item">
              <span class="pc-icon-pro">✓</span>
              <span class="pc-bullet-text">${escapeHtml(shortenBullet(pro))}</span>
            </li>
          `
          )
          .join('');

        const consHtml = (consList.length > 0 ? consList : ['Advanced customization requires higher-tier plans', 'Integration ecosystem is tailored toward core workflows'])
          .slice(0, 3)
          .map(
            (con) => `
            <li class="pc-bullet-item">
              <span class="pc-icon-con">✗</span>
              <span class="pc-bullet-text">${escapeHtml(shortenBullet(con))}</span>
            </li>
          `
          )
          .join('');

        const specs = prod.specs || {};
        const isSaved = savedProductIds.has(prod.id);
        const cleanHighlight = String(prod.highlightTag || '').replace(/^@/, '');
        const bestForText = prod.bestFor || (cleanHighlight ? `Best for ${cleanHighlight}` : '');

        return `
          <section class="clean-product-item card-product-node" itemscope itemprop="itemListElement" itemtype="https://schema.org/Product">
            <div class="product-card-box minimal-unified-card ${rankClass ? 'card-' + rankClass : ''} ${prod.claimed ? 'is-claimed' : ''}" id="prod-card-${escapeHtml(prod.id)}">
              
              ${rankNum === 1 ? `
                <div class="card-champion-ribbon">
                  <div class="ccr-left">
                    <span class="ccr-star">★</span>
                    <span class="ccr-title">TOP CHOICE 2026</span>
                    <span class="ccr-sep">·</span>
                    <span class="ccr-category">Rank #1 in ${escapeHtml(cat.title || 'Category')}</span>
                  </div>
                  <div class="ccr-right">
                    <span class="ccr-score-label">Editorial Score:</span>
                    <span class="ccr-score-val">${editorialScore} / 10</span>
                  </div>
                </div>
              ` : ''}

              <!-- Unified Header Row inside Card Box -->
              <div class="minimal-card-header">
                <div class="product-header-left">
                  <!-- Rank Badge -->
                  <div class="rank-node-badge ${rankClass}" title="Rank #${rankNum}">
                    <span class="rank-hash">#</span><span class="rank-num">${rankNum}</span>
                  </div>

                  <!-- 34px Brand Logo with rounded squircle -->
                  <div class="brand-logo-container">
                    ${renderBrandLogo(prod, 34)}
                  </div>

                  <!-- Title, Verified Badge, Rating, Subtitle -->
                  <div class="prod-identity-info">
                    <div class="prod-title-row">
                      <h3 class="minimal-prod-title">
                        <a href="${escapeHtml(prod.website)}" target="_blank" rel="noopener" class="prod-title-link" itemprop="url" data-click-prod="${escapeHtml(prod.id)}">
                          <span itemprop="name">${escapeHtml(prod.name)}</span>
                        </a>
                      </h3>

                      ${prod.claimed ? `
                        <span class="verified-claim-badge" title="Official Founder Verified">
                          <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
                          Verified
                        </span>
                      ` : ''}

                      <div class="prod-rating-badge" title="Editorial Score: ${editorialScore}/10 · Based on ${reviewsCount} verified user ratings">
                        <span class="rating-star">★</span>
                        <span class="rating-val">${rating}</span>
                        <span class="rating-count">(${reviewsFormatted})</span>
                      </div>
                    </div>

                    <div class="prod-sub-row">
                      <span class="prod-company-muted">by <span itemprop="brand">${escapeHtml(prod.companyName)}</span></span>
                      ${bestForText ? `<span class="prod-award-chip" title="${escapeHtml(bestForText)}">${escapeHtml(bestForText)}</span>` : ''}
                    </div>
                  </div>
                </div>

                <!-- Right Action Block: Primary Visit CTA + Micro-Toolbar -->
                <div class="product-header-actions">
                  <a
                    href="${escapeHtml(prod.website)}"
                    target="_blank"
                    rel="noopener"
                    class="btn-reader-visit"
                    data-click-prod="${escapeHtml(prod.id)}"
                    title="Visit official website"
                  >
                    <span>Visit</span>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M4 12L12 4M12 4H6M12 4V10"/>
                    </svg>
                  </a>

                  <div class="card-toolbar-actions">
                    <button
                      type="button"
                      class="btn-rfp-quote-pill"
                      data-rfp-prod="${escapeHtml(prod.id)}"
                      title="Request custom quote / RFP for ${escapeHtml(prod.name)}"
                    >
                      📋 Quote
                    </button>

                    <button
                      type="button"
                      class="btn-compare-vs"
                      data-compare-vs="${escapeHtml(prod.id)}"
                      title="Compare ${escapeHtml(prod.name)} head-to-head"
                    >
                      VS
                    </button>

                    ${prod.claimed ? `
                      <button
                        type="button"
                        class="btn-manage-listing"
                        data-manage-prod="${escapeHtml(prod.id)}"
                        title="Manage ${escapeHtml(prod.name)} in Founder Portal"
                      >
                        ⚙️ Manage
                      </button>
                    ` : `
                      <button
                        type="button"
                        class="btn-claim-link"
                        data-claim-prod="${escapeHtml(prod.id)}"
                        title="Claim ${escapeHtml(prod.name)} as official founder"
                      >
                        Claim
                      </button>
                    `}

                    <button
                      type="button"
                      class="btn-boost-pill"
                      data-boost-existing="${escapeHtml(prod.id)}"
                      title="Boost ${escapeHtml(prod.name)} to #1"
                      aria-label="Boost platform"
                    >
                      Boost ↗
                    </button>

                    <button
                      type="button"
                      class="btn-share-ranking icon-btn"
                      data-share-prod="${escapeHtml(prod.id)}"
                      title="Share #${rankNum} ${escapeHtml(prod.name)} ranking"
                      aria-label="Share platform ranking"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="18" cy="5" r="3"></circle>
                        <circle cx="6" cy="12" r="3"></circle>
                        <circle cx="18" cy="19" r="3"></circle>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                      </svg>
                      <span class="action-btn-text">Share</span>
                    </button>

                    <button
                      type="button"
                      class="btn-embed-badge icon-btn"
                      data-badge-prod="${escapeHtml(prod.id)}"
                      title="Get 'Featured on Top 10' embed badge for ${escapeHtml(prod.name)}"
                      aria-label="Embed badge"
                    >
                      ${SVG_ICON_BADGE}
                    </button>

                    <button
                      type="button"
                      class="btn-save-bookmark icon-btn ${isSaved ? 'saved' : ''}"
                      data-save-prod="${escapeHtml(prod.id)}"
                      data-save-name="${escapeHtml(prod.name)}"
                      title="${isSaved ? 'Remove from Saved shortlist' : 'Save to shortlist'}"
                      aria-label="Save platform"
                    >
                      ${SVG_ICON_BOOKMARK}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Option A: Studio Media Showcase (TVs, Hardware & Screenshots) -->
              ${prod.media && prod.media.heroImage ? `
                <div class="card-media-stage" data-lightbox-src="${escapeHtml(prod.media.heroImage)}" data-lightbox-title="${escapeHtml(prod.name)}" data-lightbox-tag="${escapeHtml(prod.media.overlayTag || '')}" data-lightbox-company="${escapeHtml(prod.companyName)}" data-lightbox-link="${escapeHtml(prod.website)}">
                  <img
                    src="${escapeHtml(prod.media.heroImage)}"
                    alt="${escapeHtml(prod.name)}"
                    class="card-media-img"
                    loading="lazy"
                    decoding="async"
                    onerror="this.closest('.card-media-stage').style.display='none'"
                  />
                  ${prod.media.overlayTag ? `<span class="media-spec-chip">${escapeHtml(prod.media.overlayTag)}</span>` : ''}
                  <button type="button" class="media-zoom-btn" title="View high-res photo" aria-label="Zoom photo">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="7" cy="7" r="4.5"/>
                      <path d="M10.5 10.5L14 14M7 5v4M5 7h4"/>
                    </svg>
                  </button>
                </div>
              ` : ''}

              <!-- Clean Description -->
              <p class="minimal-card-desc" itemprop="description">
                ${escapeHtml(prod.editorialSummary || prod.tagline)}
              </p>

              <!-- 1-Line Minimalist Meta Pills with Monochrome SVG Icons -->
              <div class="minimal-meta-row">
                <span class="minimal-meta-pill price-pill" title="Starting Price">${SVG_ICON_PRICE} <strong>${escapeHtml(specs.startingPrice || prod.pricingTag)}</strong></span>
                <span class="minimal-meta-pill trial-pill" title="Free Trial & Sandbox">${SVG_ICON_TRIAL} <span>${escapeHtml(specs.freeTrial || 'Free trial available')}</span></span>
                <span class="minimal-meta-pill audience-pill" title="Ideal Audience">${SVG_ICON_USERS} <span>${escapeHtml(specs.idealFor || 'Modern Teams')}</span></span>
                ${specs.deployment ? `
                  <span class="minimal-meta-pill deploy-pill" title="Deployment Model">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="8" r="6"/><path d="M8 2a9 9 0 000 12M2 8a9 9 0 0012 0"/></svg>
                    <span>${escapeHtml(specs.deployment)}</span>
                  </span>
                ` : ''}
              </div>

              <!-- Clean 2-Column Pros & Cons with Full Bullets -->
              <div class="minimal-pros-cons">
                <div class="pc-column pc-pros">
                  <div class="pc-column-label">
                    <span class="pc-dot green"></span>
                    <span>KEY ADVANTAGES</span>
                  </div>
                  <ul class="pc-list">${prosHtml}</ul>
                </div>
                <div class="pc-column pc-cons">
                  <div class="pc-column-label">
                    <span class="pc-dot amber"></span>
                    <span>TRADE-OFFS &amp; LIMITS</span>
                  </div>
                  <ul class="pc-list">${consHtml}</ul>
                </div>
              </div>
            </div>
          </section>
        `;
      })
      .join('');

    // 1b. Render Additional Listed Platforms when Total Listings > 10
    if (moreListingsSection && moreListingsTimeline) {
      if (pushedOut.length > 0) {
        moreListingsSection.classList.remove('hidden');
        moreListingsTitle.textContent = `Other Listed Platforms (${pushedOut.length} more)`;
        moreListingsTimeline.innerHTML = pushedOut
          .map(
            (prod, idx) => {
              const isSaved = savedProductIds.has(prod.id);
              const rankNum = prod.rank || (11 + idx);
              return `
            <div class="clean-product-item card-product-node">
              <div class="product-card-box minimal-unified-card" id="prod-card-${escapeHtml(prod.id)}">
                <div class="minimal-card-header">
                  <div class="product-header-left">
                    <span class="rank-node-badge organic-node">#${rankNum}</span>
                    ${renderBrandLogo(prod, 22)}
                    <a href="${escapeHtml(prod.website)}" target="_blank" rel="noopener" class="prod-title-link" data-click-prod="${escapeHtml(prod.id)}">
                      ${escapeHtml(prod.name)}
                    </a>
                    <span class="prod-company-muted">by ${escapeHtml(prod.companyName)}</span>
                  </div>
                  <div class="product-header-actions">
                    <button
                      type="button"
                      class="btn-compare-vs"
                      data-compare-vs="${escapeHtml(prod.id)}"
                      title="Compare ${escapeHtml(prod.name)} head-to-head"
                    >
                      VS
                    </button>
                    ${prod.claimed ? `
                      <span class="verified-claim-badge" title="Official Founder Verified">✓ Claimed</span>
                      <button
                        type="button"
                        class="btn-manage-listing"
                        data-manage-prod="${escapeHtml(prod.id)}"
                        title="Manage ${escapeHtml(prod.name)} in Founder Portal"
                      >
                        ⚙️ Manage
                      </button>
                    ` : `
                      <button
                        type="button"
                        class="btn-claim-link"
                        data-claim-prod="${escapeHtml(prod.id)}"
                        title="Claim ${escapeHtml(prod.name)} as official founder"
                      >
                        Claim
                      </button>
                    `}
                    <button
                      type="button"
                      class="btn-rfp-quote-pill"
                      data-rfp-prod="${escapeHtml(prod.id)}"
                      title="Request custom quote / RFP for ${escapeHtml(prod.name)}"
                    >
                      📋 Quote
                    </button>
                    <button
                      type="button"
                      class="btn-share-ranking"
                      style="height:26px;padding:0 7px;font-size:11px;"
                      data-share-prod="${escapeHtml(prod.id)}"
                      title="Share #${rankNum} ${escapeHtml(prod.name)} ranking"
                      aria-label="Share platform ranking"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="18" cy="5" r="3"></circle>
                        <circle cx="6" cy="12" r="3"></circle>
                        <circle cx="18" cy="19" r="3"></circle>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                      </svg>
                      <span>Share</span>
                    </button>
                    <button
                      type="button"
                      class="btn-boost-pill"
                      data-boost-existing="${escapeHtml(prod.id)}"
                      title="Boost ${escapeHtml(prod.name)} into Top 10"
                      aria-label="Boost platform"
                    >
                      Boost ↗
                    </button>
                    <button
                      type="button"
                      class="btn-embed-badge"
                      data-badge-prod="${escapeHtml(prod.id)}"
                      title="Get 'Featured on Top 10' embed badge"
                      aria-label="Embed badge"
                    >
                      ${SVG_ICON_BADGE}
                    </button>
                    <button
                      type="button"
                      class="btn-save-bookmark ${isSaved ? 'saved' : ''}"
                      data-save-prod="${escapeHtml(prod.id)}"
                      data-save-name="${escapeHtml(prod.name)}"
                      title="${isSaved ? 'Remove from Saved shortlist' : 'Save to shortlist'}"
                      aria-label="Save platform"
                    >
                      ${SVG_ICON_BOOKMARK}
                    </button>
                    <a href="${escapeHtml(prod.website)}" target="_blank" rel="noopener" class="btn-reader-visit" data-click-prod="${escapeHtml(prod.id)}">
                      Visit ↗
                    </a>
                  </div>
                </div>
                ${prod.media && prod.media.heroImage ? `
                  <div class="card-media-stage" data-lightbox-src="${escapeHtml(prod.media.heroImage)}" data-lightbox-title="${escapeHtml(prod.name)}" data-lightbox-tag="${escapeHtml(prod.media.overlayTag || '')}" data-lightbox-company="${escapeHtml(prod.companyName)}" data-lightbox-link="${escapeHtml(prod.website)}">
                    <img
                      src="${escapeHtml(prod.media.heroImage)}"
                      alt="${escapeHtml(prod.name)}"
                      class="card-media-img"
                      loading="lazy"
                      decoding="async"
                      onerror="this.closest('.card-media-stage').style.display='none'"
                    />
                    ${prod.media.overlayTag ? `<span class="media-spec-chip">${escapeHtml(prod.media.overlayTag)}</span>` : ''}
                    <button type="button" class="media-zoom-btn" title="View high-res photo" aria-label="Zoom photo">
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="7" cy="7" r="4.5"/>
                        <path d="M10.5 10.5L14 14M7 5v4M5 7h4"/>
                      </svg>
                    </button>
                  </div>
                ` : ''}
                <p class="minimal-card-desc" style="margin-bottom:0;">${escapeHtml(prod.tagline)}</p>
              </div>
            </div>
          `;
            }
          )
          .join('');
      } else {
        moreListingsSection.classList.add('hidden');
        moreListingsTimeline.innerHTML = '';
      }
    }

    // Boost Existing Platform Handler (Opens + Add Your Platform Modal in "Boost Existing" Mode)
    document.querySelectorAll('[data-boost-existing]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const prodId = btn.getAttribute('data-boost-existing');
        openBidModal(1, 'existing', prodId);
      });
    });

    // Head-to-Head Comparison "VS" Button Handler
    document.querySelectorAll('[data-compare-vs]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const prodId = btn.getAttribute('data-compare-vs');
        const idx = allCatProds.findIndex((p) => p.id === prodId);
        let otherProd = null;
        if (idx === 0 && allCatProds.length > 1) {
          otherProd = allCatProds[1];
        } else if (idx > 0) {
          otherProd = allCatProds[0];
        } else if (allCatProds.length > 1) {
          otherProd = allCatProds[1];
        }
        if (otherProd) {
          navigateToCompare(cat.slug, prodId, otherProd.id);
        } else {
          showToast('Need at least 2 platforms in this directory to compare.');
        }
      });
    });

    // Founder Self-Serve Portal "Manage" Button Handler
    document.querySelectorAll('[data-manage-prod]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const prodId = btn.getAttribute('data-manage-prod');
        openFounderPortal(prodId);
      });
    });

    // B2B Custom Quote / RFP Button Handler
    document.querySelectorAll('[data-rfp-prod]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const prodId = btn.getAttribute('data-rfp-prod');
        openRequestRfpModal(cat, prodId);
      });
    });

    // Claim Listing Button Handler
    document.querySelectorAll('[data-claim-prod]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const prodId = btn.getAttribute('data-claim-prod');
        const targetProd = allCatProds.find((p) => p.id === prodId);
        if (targetProd) {
          openClaimModal(targetProd);
        }
      });
    });

    // Share Product Ranking Button Handler
    document.querySelectorAll('[data-share-prod]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const prodId = btn.getAttribute('data-share-prod');
        const targetProd = allCatProds.find((p) => p.id === prodId);
        openShareRankingModal(cat, targetProd);
      });
    });

    // Embed Badge Button Handler
    document.querySelectorAll('[data-badge-prod]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const prodId = btn.getAttribute('data-badge-prod');
        const targetProd = allCatProds.find((p) => p.id === prodId);
        if (targetProd) {
          openEmbedBadgeModal(cat, targetProd);
        }
      });
    });

    // Bookmark Shortlist Button Handler
    document.querySelectorAll('[data-save-prod]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const prodId = btn.getAttribute('data-save-prod');
        const prodName = btn.getAttribute('data-save-name') || 'Platform';
        if (savedProductIds.has(prodId)) {
          savedProductIds.delete(prodId);
          persistSavedProducts();
          showToast(`Removed ${prodName} from Saved`);
        } else {
          savedProductIds.add(prodId);
          persistSavedProducts();
          showToast(`Saved ${prodName} to shortlist`);
        }
        renderSingleListPage(cat);
      });
    });

    // Populate Product Tag Selector in Review Composer
    if (commentProductTag) {
      commentProductTag.innerHTML =
        `<option value="">Tag platform (optional)</option>` +
        allCatProds
          .map((p) => `<option value="${escapeHtml(p.name)}">@${escapeHtml(p.name)}</option>`)
          .join('');
    }

    // Outbound Website Click handler
    document.querySelectorAll('[data-click-prod]').forEach((link) => {
      link.addEventListener('click', () => {
        const prodId = link.getAttribute('data-click-prod');
        fetch(`/api/categories/${cat.slug}/products/${prodId}/interact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'click' })
        })
          .then((r) => r.json())
          .then((d) => {
            if (d.state) appState = d.state;
          });
      });
    });

    // Lightbox Studio Photo Click Handler
    document.querySelectorAll('.card-media-stage').forEach((stage) => {
      stage.addEventListener('click', (e) => {
        // Don't trigger if clicked directly on an embedded link
        if (e.target.closest('a')) return;
        const src = stage.getAttribute('data-lightbox-src');
        const title = stage.getAttribute('data-lightbox-title');
        const tag = stage.getAttribute('data-lightbox-tag');
        const comp = stage.getAttribute('data-lightbox-company');
        const link = stage.getAttribute('data-lightbox-link');
        openImageLightbox(src, title, tag, comp, link);
      });
    });

    // 3. Render FAQ Accordion (Closed by Default)
    if (methodologyText) {
      methodologyText.textContent = '';
    }

    faqAccordionList.innerHTML = (guide.faqs || [])
      .map(
        (faq) => `
        <details class="faq-item">
          <summary class="faq-question">
            <span>${escapeHtml(faq.q)}</span>
          </summary>
          <p class="faq-answer">${escapeHtml(faq.a)}</p>
        </details>
      `
      )
      .join('');

    renderContextStream(cat);
    renderRelatedDirectories(cat);
  }

  function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function formatReviewMentions(rawText, allProds) {
    if (!rawText) return '';
    let escaped = escapeHtml(rawText);
    if (!allProds || allProds.length === 0) {
      return escaped.replace(
        /@([A-Za-z0-9_\-]+)/g,
        '<button type="button" class="mention-pill clickable-mention" data-mention-target="$1">@$1</button>'
      );
    }

    // Sort candidates by name length descending so multi-word names match first
    const sortedProds = allProds.slice().sort((a, b) => (b.name || '').length - (a.name || '').length);

    // 1. Exact match for full product names (@Product Name)
    sortedProds.forEach((p) => {
      if (!p.name) return;
      const escapedName = escapeRegex(escapeHtml(p.name));
      const regex = new RegExp(`@(${escapedName})(?=[\\s.,!?;:)\\]"]|$)`, 'gi');
      escaped = escaped.replace(regex, (match, p1) => {
        return `<button type="button" class="mention-pill clickable-mention" data-mention-id="${escapeHtml(
          p.id
        )}" data-mention-target="${escapeHtml(p.name)}">@${p1}</button>`;
      });
    });

    // 2. Remaining single tokens (@Token)
    escaped = escaped.replace(/@([A-Za-z0-9_\-]+)(?=[\\s.,!?;:)\\]"]|$)/g, (match, token) => {
      const lower = token.toLowerCase();
      const matchProd = sortedProds.find(
        (p) =>
          (p.name && p.name.toLowerCase() === lower) ||
          (p.name && p.name.toLowerCase().startsWith(lower)) ||
          (p.id && p.id.toLowerCase().includes(lower))
      );
      if (matchProd) {
        return `<button type="button" class="mention-pill clickable-mention" data-mention-id="${escapeHtml(
          matchProd.id
        )}" data-mention-target="${escapeHtml(matchProd.name)}">@${token}</button>`;
      }
      return `<button type="button" class="mention-pill clickable-mention" data-mention-target="${escapeHtml(
        token
      )}">@${token}</button>`;
    });

    return escaped;
  }

  function renderContextStream(cat) {
    const allProds = [...(cat.top10 || []), ...(cat.pushedOut || [])];
    // Filter out system_event, bid_event, and file_event noise — show real reader reviews (approved, legacy, or pending)
    const items = (cat.comments || [])
      .filter((c) => (!c.type || c.type === 'comment') && c.status !== 'rejected')
      .slice()
      .sort((a, b) => (b.likes || 0) - (a.likes || 0));

    if (verifiedReviewsCount) {
      verifiedReviewsCount.textContent = String(items.length);
    }
    if (commentCountBadge) {
      commentCountBadge.textContent = String(items.length);
    }

    if (items.length === 0) {
      commentsTimelineContainer.innerHTML = `
        <div style="padding: 32px 16px; text-align: center; color: var(--text-muted);">
          <p style="margin: 0 0 6px 0; font-size: 14px; font-weight: 600; color: var(--text-main);">No reviews yet for ${escapeHtml(cat.title)}</p>
          <p style="margin: 0; font-size: 12.5px;">Be the first verified reader or practitioner to share hands-on feedback.</p>
        </div>
      `;
      return;
    }

    commentsTimelineContainer.innerHTML = items
      .map((item) => {
        const formattedBody = formatReviewMentions(item.text, allProds);
        const isLiked = likedCommentIds.has(item.id);
        const starsNum = Math.max(1, Math.min(5, Number(item.rating || 5)));
        const starsHtml = '★'.repeat(starsNum) + '☆'.repeat(5 - starsNum);

        const prosHtml = (item.pros && item.pros.length)
          ? `<div class="review-pros-tags" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">
              ${item.pros.map((p) => `<span class="sentiment-chip-mini" style="font-size:10.5px;padding:2px 6px;border-radius:4px;background:var(--bg-subtle);border:1px solid var(--border-light);color:var(--text-secondary);">✓ ${escapeHtml(p)}</span>`).join('')}
             </div>`
          : '';

        const replyHtml = item.founderReply ? `
          <div class="founder-reply-card">
            <div class="founder-reply-header">
              <span class="founder-badge">👑 Official Founder / Team Response</span>
              <span class="comment-time">${escapeHtml(item.founderReply.timeAgo || 'Recently')}</span>
            </div>
            <p class="founder-reply-text">${escapeHtml(item.founderReply.text)}</p>
            <div style="margin-top:4px;font-size:11px;color:var(--text-muted);font-weight:600;">
              — ${escapeHtml(item.founderReply.authorName)} (${escapeHtml(item.founderReply.authorRole || 'Founder')})
            </div>
          </div>
        ` : `
          <button type="button" class="btn-founder-reply-trigger" data-reply-review="${escapeHtml(item.id)}">
            💬 Reply as Verified Founder
          </button>
        `;

        const isPending = item.status === 'pending';

        return `
          <div class="minimal-review-card ${isPending ? 'pending-review' : ''}">
            <div class="minimal-review-header">
              <div class="minimal-review-author">
                <span class="minimal-review-avatar" style="background:${escapeHtml(item.avatarBg || '#111827')}">
                  ${escapeHtml(item.avatarText || 'U')}
                </span>
                <div>
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <span class="comment-author-name">${escapeHtml(item.authorName)}</span>
                    <span class="verified-reviewer-pill">${SVG_ICON_VERIFIED} Verified</span>
                    ${item.authorRole ? `<span style="font-size:11px;color:var(--text-muted);">· ${escapeHtml(item.authorRole)}</span>` : ''}
                    ${isPending ? `<span style="font-size:10px;padding:1px 5px;border-radius:4px;background:#FEF3C7;color:#92400E;font-weight:600;">Pending Moderation</span>` : ''}
                  </div>
                  <div style="display:flex;align-items:center;gap:6px;margin-top:2px;flex-wrap:wrap;">
                    <span style="color:#F59E0B;font-size:12px;letter-spacing:1px;">${starsHtml}</span>
                    ${item.productName ? `<span style="font-size:11px;color:var(--text-secondary);font-weight:500;">reviewed <strong>${escapeHtml(item.productName)}</strong></span>` : ''}
                    <span class="comment-time">${escapeHtml(item.timeAgo)}</span>
                  </div>
                </div>
              </div>
              <button type="button" class="like-comment-btn ${isLiked ? 'liked' : ''}" data-like-id="${escapeHtml(item.id)}">
                ${SVG_ICON_THUMB}
                <span>${item.likes || 0}</span>
              </button>
            </div>
            <div class="comment-body-text">${formattedBody}</div>
            ${prosHtml}
            ${replyHtml}
          </div>
        `;
      })
      .join('');

    // Clickable @Platform Mentions in Reader Reviews -> Scroll to Product Card & Highlight
    commentsTimelineContainer.querySelectorAll('[data-mention-target]').forEach((pill) => {
      pill.addEventListener('click', () => {
        const mentionId = pill.getAttribute('data-mention-id');
        const rawMention = (pill.getAttribute('data-mention-target') || '').trim().toLowerCase();
        if (!mentionId && !rawMention) return;

        let matchedProd = null;
        if (mentionId) {
          matchedProd = allProds.find((p) => p.id === mentionId);
        }
        if (!matchedProd && rawMention) {
          matchedProd = allProds.find(
            (p) =>
              p.name.toLowerCase() === rawMention ||
              p.name.toLowerCase().startsWith(rawMention) ||
              rawMention.startsWith(p.name.toLowerCase()) ||
              p.name.toLowerCase().includes(rawMention)
          );
        }

        if (matchedProd) {
          if (activeQuickFilter !== 'all') {
            activeQuickFilter = 'all';
            renderSingleListPage(cat);
          }
          const isExtra = (cat.pushedOut || []).some((p) => p.id === matchedProd.id);
          if (isExtra && moreListingsTimeline && moreListingsTimeline.classList.contains('hidden')) {
            moreListingsTimeline.classList.remove('hidden');
            if (toggleMoreListingsBtn) toggleMoreListingsBtn.textContent = 'Hide extra listings ▴';
          }
          const cardEl = document.getElementById(`prod-card-${matchedProd.id}`);
          if (cardEl) {
            cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            cardEl.classList.remove('flash-highlight');
            void cardEl.offsetWidth; // Reflow to guarantee animation re-triggers
            cardEl.classList.add('flash-highlight');
            setTimeout(() => cardEl.classList.remove('flash-highlight'), 2200);
            showToast(`Jumped to #${matchedProd.rank || 'Listed'} ${matchedProd.name}`);
          }
        } else {
          showToast(`Platform "@${pill.getAttribute('data-mention-target')}" not found`);
        }
      });
    });

    // Instant Optimistic In-Place Review Upvoting (No Full-Page Re-Render!)
    commentsTimelineContainer.querySelectorAll('[data-like-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const commentId = btn.getAttribute('data-like-id');
        const countSpan = btn.querySelector('span');
        const currentCount = parseInt(countSpan ? countSpan.textContent : '0', 10) || 0;
        if (countSpan) countSpan.textContent = String(currentCount + 1);
        btn.classList.add('liked');
        likedCommentIds.add(commentId);
        persistLikedComments();

        const targetCmt = (cat.comments || []).find((c) => c.id === commentId);
        if (targetCmt) targetCmt.likes = (targetCmt.likes || 0) + 1;

        try {
          const res = await fetch(`/api/categories/${cat.slug}/comments/${commentId}/like`, {
            method: 'POST'
          });
          const data = await res.json();
          if (data.state) {
            appState = data.state;
          }
        } catch {
          // Ignore transient network errors; optimistic state is already applied
        }
      });
    });

    // Official Founder / Team Reply Handler
    commentsTimelineContainer.querySelectorAll('[data-reply-review]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const reviewId = btn.getAttribute('data-reply-review');
        const replyText = prompt('Enter your official founder/team response to this review:');
        if (!replyText || !replyText.trim()) return;

        try {
          const res = await fetch(`/api/categories/${cat.slug}/reviews/${reviewId}/reply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: replyText.trim(),
              authorName: currentUser ? currentUser.name : 'Verified Founder',
              authorRole: currentUser?.company ? `${currentUser.company} Representative` : 'Founder / Official Rep'
            })
          });
          const data = await res.json();
          if (!res.ok) {
            showToast(data.error || 'Could not post response');
            return;
          }
          appState = data.state;
          showToast('Official founder response published!');
          renderContextStream(getActiveCategory());
        } catch {
          showToast('Failed to post reply');
        }
      });
    });
  }

  function updateTabVisibility() {
    document.querySelectorAll('.subnav-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === currentTab);
    });

    tabPanelRankings.classList.toggle('hidden', currentTab !== 'rankings');
    if (tabPanelCompare) tabPanelCompare.classList.toggle('hidden', currentTab !== 'compare');
    tabPanelContext.classList.toggle('hidden', currentTab !== 'context');
    if (tabPanelFaq) tabPanelFaq.classList.toggle('hidden', currentTab !== 'faq');
  }

  // =========================================================================
  // CATEGORY DROPDOWN & USER MENU
  // =========================================================================
  function renderCategoryMenu() {
    const cats = appState.categories || [];
    catTotalCountBadge.textContent = `${cats.length} Guides`;

    categoryMenuList.innerHTML = cats
      .map(
        (c) => `
        <button type="button" class="cat-menu-item ${c.slug === currentCategorySlug && currentView === 'list' ? 'active' : ''}" data-select-cat="${escapeHtml(c.slug)}">
          <div class="cat-menu-item-left">
            <span class="cat-mini-icon" style="background:${escapeHtml(c.iconBg)};color:${escapeHtml(c.iconColor)};">
              ${renderCategorySvgIcon(c, 13)}
            </span>
            <div>
              <div class="cat-menu-title">${escapeHtml(c.title)}</div>
              <div class="cat-menu-sub">${escapeHtml(formatBumpedViews(c.metrics?.monthlyViews, c.slug))} views</div>
            </div>
          </div>
          <span class="cat-menu-bid-tag">Read →</span>
        </button>
      `
      )
      .join('');

    categoryMenuList.querySelectorAll('[data-select-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slug = btn.getAttribute('data-select-cat');
        categoryDropdownMenu.classList.add('hidden');
        navigateToCategory(slug);
      });
    });
  }

  function renderUserMenu() {
    if (!currentUser || !userMenuCurrentInfo || !demoUsersList) return;
    userMenuCurrentInfo.innerHTML = `
      <div style="font-weight:600;font-size:13px;color:#111827;">${escapeHtml(currentUser.name)}</div>
      <div style="font-size:11.5px;color:#6B7280;">${escapeHtml(currentUser.email)} · ${escapeHtml(currentUser.company)}</div>
    `;

    demoUsersList.innerHTML = (appState.users || [])
      .map(
        (u) => `
        <button type="button" class="user-switch-item" data-user-id="${escapeHtml(u.id)}">
          <span class="mini-avatar" style="background:${escapeHtml(u.avatarBg)}">${escapeHtml(u.avatarText)}</span>
          <div style="text-align:left;">
            <div style="font-size:12.5px;font-weight:500;color:#111827;">${escapeHtml(u.name)}</div>
            <div style="font-size:11px;color:#6B7280;">${escapeHtml(u.company)}</div>
          </div>
        </button>
      `
      )
      .join('');

    demoUsersList.querySelectorAll('[data-user-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const uid = btn.getAttribute('data-user-id');
        const found = appState.users.find((u) => u.id === uid);
        if (found) {
          currentUser = found;
          if (userDropdownMenu) userDropdownMenu.classList.add('hidden');
          renderAll();
          showToast(`Switched profile to ${currentUser.name}`);
        }
      });
    });
  }

  // =========================================================================
  // MODAL 1: FOR BRANDS — "NEW PLATFORM" VS "BOOST EXISTING PLATFORM"
  // =========================================================================
  function setBidModalMode(mode, prefillProductId = null) {
    if (mode === 'existing') {
      currentBidMode = 'existing';
    } else if (mode === 'retainer') {
      currentBidMode = 'retainer';
    } else {
      currentBidMode = 'new';
    }
    const cat = getActiveCategory();
    if (!cat) return;

    if (bidModeTabs) {
      bidModeTabs.querySelectorAll('[data-bid-mode]').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-bid-mode') === currentBidMode);
      });
    }

    const isExisting = currentBidMode === 'existing';
    const isRetainer = currentBidMode === 'retainer';
    const isNew = currentBidMode === 'new';

    if (bidModalHeadingTitle) {
      bidModalHeadingTitle.textContent = isRetainer
        ? 'Sponsorship Retainer (PayPal MRR)'
        : isExisting
        ? 'Boost Existing Platform'
        : 'Add Your Platform';
    }

    if (bidNewFieldsWrap) bidNewFieldsWrap.classList.toggle('hidden', !isNew);
    if (bidExistingFieldsWrap) bidExistingFieldsWrap.classList.toggle('hidden', !isExisting);
    if (bidRetainerFieldsWrap) bidRetainerFieldsWrap.classList.toggle('hidden', !isRetainer);
    if (bidAmountFieldsWrap) bidAmountFieldsWrap.classList.toggle('hidden', isRetainer);

    if (bidWebsite) bidWebsite.required = isNew;
    if (bidProductName) bidProductName.required = isNew;
    if (bidTagline) bidTagline.required = isNew;

    if (isExisting && bidExistingProductSelect) {
      const allProds = [...(cat.top10 || []), ...(cat.pushedOut || [])];
      bidExistingProductSelect.innerHTML = allProds
        .map(
          (p, idx) =>
            `<option value="${escapeHtml(p.id)}">#${p.rank || (idx + 1)} ${escapeHtml(p.name)} — ${
              Number(p.amountPaid || 0) > 0 ? `$${p.amountPaid} current deposit` : 'Organic ($0)'
            }</option>`
        )
        .join('');
      if (prefillProductId) {
        bidExistingProductSelect.value = prefillProductId;
      }
      updateExistingBoostAmount(cat);
    } else if (isRetainer && bidRetainerProductSelect) {
      const allProds = [...(cat.top10 || []), ...(cat.pushedOut || [])];
      bidRetainerProductSelect.innerHTML = allProds
        .map(
          (p, idx) =>
            `<option value="${escapeHtml(p.id)}">#${p.rank || (idx + 1)} ${escapeHtml(p.name)} (${escapeHtml(p.companyName)})</option>`
        )
        .join('');
      if (prefillProductId) {
        bidRetainerProductSelect.value = prefillProductId;
      }
      updateRetainerCardSelection(selectedRetainerTier);
    } else {
      renderModalRankPicker(cat);
    }
  }

  function updateRetainerCardSelection(tier) {
    selectedRetainerTier = tier;
    if (retainerCardLock1) retainerCardLock1.classList.toggle('selected', tier === 'lock_rank_1');
    if (retainerCardTop3) retainerCardTop3.classList.toggle('selected', tier === 'guaranteed_top_3');
    if (submitBidBtn) {
      submitBidBtn.textContent = tier === 'lock_rank_1'
        ? 'Subscribe with PayPal ($299/mo)'
        : 'Subscribe with PayPal ($149/mo)';
    }
  }

  function updateExistingBoostAmount(cat) {
    if (!cat || !bidExistingProductSelect) return;
    const allProds = [...(cat.top10 || []), ...(cat.pushedOut || [])];
    const selectedId = bidExistingProductSelect.value;
    const targetProd = allProds.find((p) => p.id === selectedId) || allProds[0];
    const topPaid = Number((cat.top10 && cat.top10[0] && cat.top10[0].amountPaid) || 0);
    const currentPaid = Number((targetProd && targetProd.amountPaid) || 0);
    const minInc = Number((appState && appState.platformStats && appState.platformStats.minOutbidIncrement) || 25);
    const suggestedTopUp = Math.max(49, topPaid >= currentPaid ? topPaid - currentPaid + minInc : minInc);
    bidPaymentAmount.value = suggestedTopUp;
    updateSimulatedRankBanner(cat, suggestedTopUp);
  }

  function openBidModal(targetRank = 1, mode = 'new', prefillProductId = null) {
    const cat = getActiveCategory();
    if (!cat) return;

    selectedModalRank = targetRank || 1;
    bidModalCategoryPill.textContent = cat.title;

    if (currentUser) {
      bidOwnerEmail.value = currentUser.email || '';
      if (!bidCompanyName.value) bidCompanyName.value = currentUser.company || '';
    }

    setBidModalMode(mode, prefillProductId);
    bidModalBackdrop.classList.remove('hidden');
  }

  function renderModalRankPicker(cat) {
    const ladder = cat.slotLadder || [];
    modalRankPickerGrid.innerHTML = ladder
      .map((slot) => {
        const isSel = slot.rank === selectedModalRank;
        return `
          <button
            type="button"
            class="rank-pick-tile ${isSel ? 'selected' : ''}"
            data-pick-rank="${slot.rank}"
            data-req-bid="${slot.requiredBid}"
          >
            <div class="rp-rank">#${slot.rank}</div>
            <div class="rp-price">$${slot.requiredBid}</div>
            <div class="rp-holder">${slot.isOrganic ? 'Open' : escapeHtml(slot.holderName)}</div>
          </button>
        `;
      })
      .join('');

    const chosenSlot = ladder.find((s) => s.rank === selectedModalRank) || ladder[0];
    if (chosenSlot) {
      bidPaymentAmount.value = chosenSlot.requiredBid;
      updateSimulatedRankBanner(cat, chosenSlot.requiredBid);
    }

    modalRankPickerGrid.querySelectorAll('[data-pick-rank]').forEach((tile) => {
      tile.addEventListener('click', () => {
        selectedModalRank = Number(tile.getAttribute('data-pick-rank'));
        const reqBid = Number(tile.getAttribute('data-req-bid'));
        bidPaymentAmount.value = reqBid;
        modalRankPickerGrid.querySelectorAll('.rank-pick-tile').forEach((t) => t.classList.remove('selected'));
        tile.classList.add('selected');
        updateSimulatedRankBanner(cat, reqBid);
      });
    });
  }

  function updateSimulatedRankBanner(cat, amount) {
    const num = Number(amount || 0);
    if (currentBidMode === 'existing' && bidExistingProductSelect) {
      const allProds = [...(cat.top10 || []), ...(cat.pushedOut || [])];
      const targetProd = allProds.find((p) => p.id === bidExistingProductSelect.value) || allProds[0];
      const newTotal = Number((targetProd && targetProd.amountPaid) || 0) + num;
      const rankNum = targetProd ? (targetProd.rank || 'Listed') : 'Listed';
      rankSimulationBanner.innerHTML = `Boosting <strong>${escapeHtml(
        targetProd ? targetProd.name : 'Platform'
      )}</strong> (#${rankNum}) by <strong>+$${num.toLocaleString()}</strong> → <strong>$${newTotal.toLocaleString()} total deposit</strong> (Projected #1)`;
      submitBidBtn.textContent = `Boost ${targetProd ? targetProd.name : 'Platform'} (+$${num.toLocaleString()})`;
    } else {
      rankSimulationBanner.innerHTML = `Placement deposit: <strong>$${num.toLocaleString()}</strong> · Instant listing in <strong>${escapeHtml(cat.title)}</strong>`;
      submitBidBtn.textContent = `Add Platform ($${num.toLocaleString()})`;
    }
  }

  if (bidModeTabs) {
    bidModeTabs.querySelectorAll('[data-bid-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setBidModalMode(btn.getAttribute('data-bid-mode'));
      });
    });
  }

  if (bidExistingProductSelect) {
    bidExistingProductSelect.addEventListener('change', () => {
      const cat = getActiveCategory();
      if (cat) updateExistingBoostAmount(cat);
    });
  }

  if (retainerCardLock1) {
    retainerCardLock1.addEventListener('click', () => updateRetainerCardSelection('lock_rank_1'));
  }
  if (retainerCardTop3) {
    retainerCardTop3.addEventListener('click', () => updateRetainerCardSelection('guaranteed_top_3'));
  }

  // Helper: Auto-fill Brand Name & Favicon from Website URL
  function deriveBrandFromUrl(urlStr) {
    const domain = extractDomain(urlStr);
    if (!domain) return null;
    const base = domain.split('.')[0] || '';
    if (!base) return null;
    const brandName = base.charAt(0).toUpperCase() + base.slice(1);
    return { domain, brandName };
  }

  if (bidWebsite) {
    bidWebsite.addEventListener('input', () => {
      const info = deriveBrandFromUrl(bidWebsite.value.trim());
      if (info) {
        if (bidUrlFaviconPreview) {
          const favUrl = `/api/favicon?domain=${encodeURIComponent(info.domain)}&text=${encodeURIComponent(info.brandName[0] || '★')}`;
          bidUrlFaviconPreview.innerHTML = `<img src="${favUrl}" alt="" style="width:16px;height:16px;border-radius:4px;display:block;" />`;
        }
        if (!bidProductName.value || bidProductName.dataset.autofilled === 'true') {
          bidProductName.value = info.brandName;
          bidProductName.dataset.autofilled = 'true';
        }
        bidCompanyName.value = `${info.brandName} Inc`;
      } else if (bidUrlFaviconPreview) {
        bidUrlFaviconPreview.textContent = '🌐';
      }
    });
  }

  if (bidProductName) {
    bidProductName.addEventListener('input', () => {
      bidProductName.dataset.autofilled = 'false';
      if (bidProductName.value.trim()) {
        bidCompanyName.value = `${bidProductName.value.trim()} Inc`;
      }
    });
  }

  if (newListWebsite) {
    newListWebsite.addEventListener('input', () => {
      const info = deriveBrandFromUrl(newListWebsite.value.trim());
      if (info) {
        if (!newListProdName.value || newListProdName.dataset.autofilled === 'true') {
          newListProdName.value = info.brandName;
          newListProdName.dataset.autofilled = 'true';
        }
        newListCompany.value = `${info.brandName} Inc`;
      }
    });
  }

  if (newListProdName) {
    newListProdName.addEventListener('input', () => {
      newListProdName.dataset.autofilled = 'false';
      if (newListProdName.value.trim()) {
        newListCompany.value = `${newListProdName.value.trim()} Inc`;
      }
    });
  }

  // =========================================================================
  // MODAL 2: LAUNCH A NEW TOP 10 BUYING GUIDE ($99 PAYWALL)
  // =========================================================================
  function openCreateListPaywallModal(prefillTitle = '') {
    if (prefillTitle) {
      newListTitleInput.value = prefillTitle.toLowerCase().startsWith('top 10')
        ? prefillTitle
        : `Top 10 ${prefillTitle}`;
    } else if (homeBigSearchInput.value.trim()) {
      const q = homeBigSearchInput.value.trim();
      newListTitleInput.value = q.toLowerCase().startsWith('top 10') ? q : `Top 10 ${q}`;
    } else {
      newListTitleInput.value = '';
    }

    if (currentUser) {
      newListEmail.value = currentUser.email || 'founder@company.com';
      if (!newListCompany.value) newListCompany.value = currentUser.company || '';
    }

    createListModalBackdrop.classList.remove('hidden');
  }

  // =========================================================================
  // DARK / LIGHT MODE TOGGLE
  // =========================================================================
  function syncThemeIcons() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (themeIconMoon && themeIconSun) {
      themeIconMoon.classList.toggle('hidden', isDark);
      themeIconSun.classList.toggle('hidden', !isDark);
    }
  }
  syncThemeIcons();

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('top10_theme', next);
      syncThemeIcons();
    });
  }

  // =========================================================================
  // EVENT LISTENERS
  // =========================================================================
  brandHomeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    navigateToHome();
  });

  if (backToHomeBtn) {
    backToHomeBtn.addEventListener('click', () => {
      navigateToHome();
    });
  }

  homeBigSearchInput.addEventListener('input', () => {
    renderHomePage();
  });

  homeBigSearchInput.addEventListener('focus', () => {
    if (searchKbdBadge) searchKbdBadge.classList.add('hidden');
  });

  homeBigSearchInput.addEventListener('blur', () => {
    if (searchKbdBadge && !homeBigSearchInput.value.trim()) {
      searchKbdBadge.classList.remove('hidden');
    }
  });

  // Topbar Search Bar + Instant Live Dropdown (Available on All Pages)
  function renderTopbarSearchDropdown() {
    if (!topbarSearchInput || !topbarLiveSearchDropdown || !appState) return;
    const rawQuery = (topbarSearchInput.value || '').trim();
    const q = rawQuery.toLowerCase();

    if (topbarSearchClearBtn) {
      topbarSearchClearBtn.classList.toggle('hidden', !rawQuery);
    }
    if (topbarSearchKbd) {
      topbarSearchKbd.classList.toggle('hidden', Boolean(rawQuery) || document.activeElement === topbarSearchInput);
    }

    if (!q) {
      topbarLiveSearchDropdown.classList.add('hidden');
      topbarLiveSearchDropdown.innerHTML = '';
      return;
    }

    const allCats = appState.categories || [];
    const matchedCats = allCats
      .filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (c.shortName || '').toLowerCase().includes(q)
      )
      .slice(0, 4);

    const prodMatches = [];
    allCats.forEach((c) => {
      [...(c.top10 || []), ...(c.pushedOut || [])].forEach((p) => {
        if (
          p.name.toLowerCase().includes(q) ||
          (p.companyName || '').toLowerCase().includes(q) ||
          (p.tagline || '').toLowerCase().includes(q)
        ) {
          prodMatches.push({ prod: p, cat: c });
        }
      });
    });
    const topProds = prodMatches.slice(0, 5);

    let dropdownHtml = '';
    if (matchedCats.length > 0) {
      dropdownHtml += `<div class="lsd-section-label">Directories</div>`;
      dropdownHtml += matchedCats
        .map(
          (c) => `
          <button type="button" class="lsd-item" data-top-lsd-cat="${escapeHtml(c.slug)}">
            <span class="lsd-item-left">
              <span class="entity-logo-lg" style="width:20px;height:20px;border-radius:5px;background:${escapeHtml(c.iconBg)};color:${escapeHtml(c.iconColor)};">${renderCategorySvgIcon(c, 12)}</span>
              <strong>${escapeHtml(c.title)}</strong>
            </span>
            <span class="lsd-item-meta">${escapeHtml(formatBumpedViews(c.metrics?.monthlyViews, c.slug))} views →</span>
          </button>
        `
        )
        .join('');
    }

    if (topProds.length > 0) {
      dropdownHtml += `<div class="lsd-section-label">Platforms</div>`;
      dropdownHtml += topProds
        .map(
          ({ prod, cat }) => `
          <button type="button" class="lsd-item" data-top-lsd-prod="${escapeHtml(prod.id)}" data-top-lsd-cat="${escapeHtml(cat.slug)}">
            <span class="lsd-item-left">
              ${renderBrandLogo(prod, 18)}
              <strong>${escapeHtml(prod.name)}</strong>
              <span class="lsd-sub-company">in ${escapeHtml(cat.title)}</span>
            </span>
            <span class="lsd-item-meta">${escapeHtml(prod.pricingTag)} →</span>
          </button>
        `
        )
        .join('');
    }

    const matchedArticles = (appState.articles || [])
      .filter((a) => a.title.toLowerCase().includes(q) || (a.subtitle || '').toLowerCase().includes(q))
      .slice(0, 3);

    if (matchedArticles.length > 0) {
      dropdownHtml += `<div class="lsd-section-label">Buying Guides &amp; Teardowns</div>`;
      dropdownHtml += matchedArticles
        .map(
          (a) => `
          <button type="button" class="lsd-item" data-top-lsd-article="${escapeHtml(a.slug)}">
            <span class="lsd-item-left">
              <span class="entity-logo-lg" style="width:20px;height:20px;border-radius:5px;background:#111827;color:#FFF;font-size:10px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;">📖</span>
              <strong>${escapeHtml(a.title)}</strong>
            </span>
            <span class="lsd-item-meta">${escapeHtml(a.readTime)} →</span>
          </button>
        `
        )
        .join('');
    }

    if (matchedCats.length === 0 && topProds.length === 0 && matchedArticles.length === 0) {
      const formattedListTitle = rawQuery.toLowerCase().startsWith('top 10')
        ? rawQuery
        : `Top 10 ${rawQuery}`;
      dropdownHtml = `
        <div class="lsd-empty-launch">
          <div class="lsd-empty-text">No matches for "${escapeHtml(rawQuery)}"</div>
          <button type="button" class="lsd-launch-btn" id="topbarLaunchMissingBtn">
            + Launch "${escapeHtml(formattedListTitle)}" ($99)
          </button>
        </div>
      `;
    }

    topbarLiveSearchDropdown.innerHTML = dropdownHtml;
    topbarLiveSearchDropdown.classList.remove('hidden');

    topbarLiveSearchDropdown.querySelectorAll('[data-top-lsd-article]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slug = btn.getAttribute('data-top-lsd-article');
        topbarLiveSearchDropdown.classList.add('hidden');
        topbarSearchInput.value = '';
        if (topbarSearchClearBtn) topbarSearchClearBtn.classList.add('hidden');
        if (topbarSearchKbd) topbarSearchKbd.classList.remove('hidden');
        navigateToArticle(slug);
      });
    });

    topbarLiveSearchDropdown.querySelectorAll('[data-top-lsd-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetCat = btn.getAttribute('data-top-lsd-cat');
        const targetProd = btn.getAttribute('data-top-lsd-prod');
        topbarLiveSearchDropdown.classList.add('hidden');
        topbarSearchInput.value = '';
        if (topbarSearchClearBtn) topbarSearchClearBtn.classList.add('hidden');
        if (topbarSearchKbd) topbarSearchKbd.classList.remove('hidden');
        activeQuickFilter = 'all';
        navigateToCategory(targetCat);
        if (targetProd) {
          setTimeout(() => {
            const cardEl = document.getElementById(`prod-card-${targetProd}`);
            if (cardEl) {
              cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
              cardEl.classList.add('flash-highlight');
              setTimeout(() => cardEl.classList.remove('flash-highlight'), 1800);
            }
          }, 80);
        }
      });
    });

    const launchBtn = document.getElementById('topbarLaunchMissingBtn');
    if (launchBtn) {
      launchBtn.addEventListener('click', () => {
        const qVal = topbarSearchInput.value.trim();
        topbarLiveSearchDropdown.classList.add('hidden');
        openCreateListPaywallModal(qVal);
      });
    }
  }

  if (topbarSearchInput) {
    topbarSearchInput.addEventListener('input', () => {
      renderTopbarSearchDropdown();
    });
    topbarSearchInput.addEventListener('focus', () => {
      if (topbarSearchKbd) topbarSearchKbd.classList.add('hidden');
      if (topbarSearchInput.value.trim()) renderTopbarSearchDropdown();
    });
    topbarSearchInput.addEventListener('blur', () => {
      if (topbarSearchKbd && !topbarSearchInput.value.trim()) {
        topbarSearchKbd.classList.remove('hidden');
      }
    });
  }

  if (topbarSearchClearBtn && topbarSearchInput) {
    topbarSearchClearBtn.addEventListener('click', () => {
      topbarSearchInput.value = '';
      renderTopbarSearchDropdown();
      topbarSearchInput.focus();
    });
  }

  // Keyboard Navigation (ArrowDown / ArrowUp / Enter / Escape) for Search Dropdowns
  function attachSearchKeyboardNav(inputEl, dropdownEl) {
    if (!inputEl || !dropdownEl) return;
    inputEl.addEventListener('keydown', (e) => {
      if (dropdownEl.classList.contains('hidden')) return;
      const items = Array.from(dropdownEl.querySelectorAll('.lsd-item, .lsd-launch-btn'));
      if (items.length === 0) return;

      let curIdx = items.findIndex((el) => el.classList.contains('kbd-active'));
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        items.forEach((el) => el.classList.remove('kbd-active'));
        const nextIdx = curIdx < items.length - 1 ? curIdx + 1 : 0;
        items[nextIdx].classList.add('kbd-active');
        items[nextIdx].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        items.forEach((el) => el.classList.remove('kbd-active'));
        const prevIdx = curIdx > 0 ? curIdx - 1 : items.length - 1;
        items[prevIdx].classList.add('kbd-active');
        items[prevIdx].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = curIdx >= 0 ? items[curIdx] : items[0];
        if (target) target.click();
      } else if (e.key === 'Escape') {
        dropdownEl.classList.add('hidden');
        inputEl.blur();
      }
    });
  }

  attachSearchKeyboardNav(homeBigSearchInput, homeLiveSearchDropdown);
  attachSearchKeyboardNav(topbarSearchInput, topbarLiveSearchDropdown);

  // Press "/" from Anywhere to Focus Search Instantly
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (imageLightboxModalBackdrop && !imageLightboxModalBackdrop.classList.contains('hidden')) {
        imageLightboxModalBackdrop.classList.add('hidden');
        return;
      }
      if (compareSavedModalBackdrop && !compareSavedModalBackdrop.classList.contains('hidden')) {
        compareSavedModalBackdrop.classList.add('hidden');
        return;
      }
      if (badgeModalBackdrop && !badgeModalBackdrop.classList.contains('hidden')) {
        badgeModalBackdrop.classList.add('hidden');
        return;
      }
      if (writeReviewModalBackdrop && !writeReviewModalBackdrop.classList.contains('hidden')) {
        writeReviewModalBackdrop.classList.add('hidden');
        return;
      }
      if (claimListingModalBackdrop && !claimListingModalBackdrop.classList.contains('hidden')) {
        claimListingModalBackdrop.classList.add('hidden');
        return;
      }
      if (shareRankingModalBackdrop && !shareRankingModalBackdrop.classList.contains('hidden')) {
        shareRankingModalBackdrop.classList.add('hidden');
        return;
      }
      if (requestRfpModalBackdrop && !requestRfpModalBackdrop.classList.contains('hidden')) {
        requestRfpModalBackdrop.classList.add('hidden');
        return;
      }
      if (founderPortalModalBackdrop && !founderPortalModalBackdrop.classList.contains('hidden')) {
        founderPortalModalBackdrop.classList.add('hidden');
        return;
      }
      if (bidModalBackdrop && !bidModalBackdrop.classList.contains('hidden')) {
        bidModalBackdrop.classList.add('hidden');
        return;
      }
      if (createListModalBackdrop && !createListModalBackdrop.classList.contains('hidden')) {
        createListModalBackdrop.classList.add('hidden');
        return;
      }
      if (categoryEditorModalBackdrop && !categoryEditorModalBackdrop.classList.contains('hidden')) {
        categoryEditorModalBackdrop.classList.add('hidden');
        return;
      }
      if (blogEditorModalBackdrop && !blogEditorModalBackdrop.classList.contains('hidden')) {
        blogEditorModalBackdrop.classList.add('hidden');
        return;
      }
      if (adminProductEditorModalBackdrop && !adminProductEditorModalBackdrop.classList.contains('hidden')) {
        adminProductEditorModalBackdrop.classList.add('hidden');
        return;
      }
    }
    if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      if (currentView === 'list' && topbarSearchInput) {
        topbarSearchInput.focus();
        topbarSearchInput.select();
      } else if (homeBigSearchInput) {
        homeBigSearchInput.focus();
        homeBigSearchInput.select();
      }
    }
  });

  // Interactive 7D / 30D / 1Y Analytics Range Switcher
  if (analyticsRangeTabs) {
    analyticsRangeTabs.querySelectorAll('[data-range]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeAnalyticsRange = btn.getAttribute('data-range') || '30d';
        const cat = getActiveCategory();
        if (cat) renderAnalyticsRange(cat);
      });
    });
  }

  // View All Directories Footer Button
  if (viewAllDirectoriesFooterBtn) {
    viewAllDirectoriesFooterBtn.addEventListener('click', () => {
      navigateToHome();
    });
  }

  // Embed Badge Modal Handlers
  if (closeBadgeModalBtn) {
    closeBadgeModalBtn.addEventListener('click', () => badgeModalBackdrop.classList.add('hidden'));
  }
  if (doneBadgeModalBtn) {
    doneBadgeModalBtn.addEventListener('click', () => badgeModalBackdrop.classList.add('hidden'));
  }
  if (copyBadgeHtmlBtn && badgeHtmlCode) {
    copyBadgeHtmlBtn.addEventListener('click', async () => {
      await copyTextWithFallback(badgeHtmlCode.value, badgeHtmlCode);
      copyBadgeHtmlBtn.textContent = 'Copied ✓';
      setTimeout(() => {
        copyBadgeHtmlBtn.textContent = 'Copy HTML';
      }, 2000);
      showToast('HTML badge snippet copied to clipboard');
    });
  }
  if (copyBadgeMdBtn && badgeMarkdownCode) {
    copyBadgeMdBtn.addEventListener('click', async () => {
      await copyTextWithFallback(badgeMarkdownCode.value, badgeMarkdownCode);
      copyBadgeMdBtn.textContent = 'Copied ✓';
      setTimeout(() => {
        copyBadgeMdBtn.textContent = 'Copy Markdown';
      }, 2000);
      showToast('Markdown badge snippet copied to clipboard');
    });
  }

  // Compare Saved Platforms Pill & Modal Handlers
  if (compareSavedPill) {
    compareSavedPill.addEventListener('click', () => {
      const cat = getActiveCategory();
      if (cat) openCompareSavedModal(cat);
    });
  }
  if (closeCompareModalBtn && compareSavedModalBackdrop) {
    closeCompareModalBtn.addEventListener('click', () => compareSavedModalBackdrop.classList.add('hidden'));
  }

  // High-Res Image Lightbox Modal Handlers
  if (closeLightboxModalBtn && imageLightboxModalBackdrop) {
    closeLightboxModalBtn.addEventListener('click', () => imageLightboxModalBackdrop.classList.add('hidden'));
    imageLightboxModalBackdrop.addEventListener('click', (e) => {
      if (e.target === imageLightboxModalBackdrop) {
        imageLightboxModalBackdrop.classList.add('hidden');
      }
    });
  }

  // 1-Click Share / Copy Direct Link Button
  if (copyListUrlBtn) {
    copyListUrlBtn.addEventListener('click', async () => {
      const cat = getActiveCategory();
      const urlToCopy = cat ? `${window.location.origin}/list/${cat.slug}` : window.location.href;
      await copyTextWithFallback(urlToCopy);
      if (copyListUrlLabel) {
        copyListUrlLabel.textContent = 'Copied ✓';
        setTimeout(() => {
          copyListUrlLabel.textContent = 'Share';
        }, 2000);
      }
      showToast('Direct link copied to clipboard');
    });
  }

  // =========================================================================
  // MODAL 7: COMMUNITY "+ WRITE A REVIEW" WORKFLOW
  // =========================================================================
  const starLabels = {
    1: '1 / 5 — Needs Significant Improvement',
    2: '2 / 5 — Below Expectations',
    3: '3 / 5 — Average / Acceptable',
    4: '4 / 5 — Very Good & Reliable',
    5: '5 / 5 — Exceptional / Highly Recommended'
  };

  function setReviewStars(val) {
    const num = Math.max(1, Math.min(5, Number(val) || 5));
    if (reviewStarValue) reviewStarValue.value = String(num);
    if (starRatingLabel) starRatingLabel.textContent = starLabels[num] || `${num} / 5`;
    if (starRatingPicker) {
      starRatingPicker.querySelectorAll('.star-pick-btn').forEach((btn) => {
        const s = Number(btn.getAttribute('data-star') || 0);
        btn.classList.toggle('active', s <= num);
      });
    }
  }

  if (starRatingPicker) {
    starRatingPicker.querySelectorAll('.star-pick-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        setReviewStars(btn.getAttribute('data-star'));
      });
    });
  }

  if (reviewProsChips) {
    reviewProsChips.querySelectorAll('.sentiment-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('selected');
      });
    });
  }

  if (openWriteReviewModalBtn) {
    openWriteReviewModalBtn.addEventListener('click', () => {
      const cat = getActiveCategory();
      if (!cat) return;
      if (reviewModalCategoryEyebrow) reviewModalCategoryEyebrow.textContent = cat.title;

      if (reviewProductSelect) {
        const allProds = [...(cat.top10 || []), ...(cat.pushedOut || [])];
        reviewProductSelect.innerHTML = `<option value="">Entire Category (${escapeHtml(cat.title)})</option>` +
          allProds.map((p, idx) => `<option value="${escapeHtml(p.id)}">#${p.rank || (idx + 1)} ${escapeHtml(p.name)}</option>`).join('');
      }

      setReviewStars(5);

      if (reviewProsChips) {
        reviewProsChips.querySelectorAll('.sentiment-chip').forEach((c) => c.classList.remove('selected'));
      }

      if (currentUser) {
        if (reviewAuthorName) reviewAuthorName.value = currentUser.name || '';
        if (reviewAuthorEmail) reviewAuthorEmail.value = currentUser.email || '';
      }

      if (writeReviewModalBackdrop) {
        writeReviewModalBackdrop.classList.remove('hidden');
      }
    });
  }

  if (closeWriteReviewModalBtn) {
    closeWriteReviewModalBtn.addEventListener('click', () => {
      if (writeReviewModalBackdrop) writeReviewModalBackdrop.classList.add('hidden');
    });
  }
  if (cancelWriteReviewBtn) {
    cancelWriteReviewBtn.addEventListener('click', () => {
      if (writeReviewModalBackdrop) writeReviewModalBackdrop.classList.add('hidden');
    });
  }

  if (writeReviewForm) {
    writeReviewForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cat = getActiveCategory();
      if (!cat) return;

      const selectedPros = [];
      if (reviewProsChips) {
        reviewProsChips.querySelectorAll('.sentiment-chip.selected').forEach((c) => {
          selectedPros.push(c.getAttribute('data-sentiment') || c.textContent.trim());
        });
      }

      const selectedProdId = reviewProductSelect ? reviewProductSelect.value : null;
      const allProds = [...(cat.top10 || []), ...(cat.pushedOut || [])];
      const selectedProd = allProds.find((p) => p.id === selectedProdId);

      const payload = {
        productId: selectedProdId || null,
        productName: selectedProd ? selectedProd.name : 'Category Review',
        authorName: reviewAuthorName?.value?.trim() || 'Verified Reader',
        authorEmail: reviewAuthorEmail?.value?.trim() || '',
        authorRole: reviewAuthorRole?.value?.trim() || 'Software Architect',
        rating: Number(reviewStarValue?.value || 5),
        pros: selectedPros,
        text: reviewBodyText?.value?.trim() || ''
      };

      try {
        const res = await fetch(`/api/categories/${cat.slug}/reviews`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'Could not submit review');
          return;
        }

        if (data.state) appState = data.state;
        if (writeReviewModalBackdrop) writeReviewModalBackdrop.classList.add('hidden');
        writeReviewForm.reset();
        showToast('Review submitted! It has been routed to the admin moderation queue.');
        const activeCat = getActiveCategory();
        if (activeCat) renderContextStream(activeCat);
      } catch {
        showToast('Failed to submit review');
      }
    });
  }

  // =========================================================================
  // MODAL 8: "CLAIM THIS LISTING" VERIFICATION WORKFLOW FOR BRANDS
  // =========================================================================
  function openClaimModal(prod) {
    if (!prod) return;
    activeClaimTarget = prod;
    if (claimModalTitle) claimModalTitle.textContent = `Claim ${prod.name}`;
    if (claimTargetProdName) claimTargetProdName.textContent = prod.name;
    const domain = extractDomain(prod.website || '') || 'company.com';
    if (claimWorkEmail) {
      claimWorkEmail.placeholder = `alex@${domain}`;
      if (currentUser && currentUser.email && currentUser.email.endsWith(`@${domain}`)) {
        claimWorkEmail.value = currentUser.email;
      }
    }
    if (claimSendCodeForm) claimSendCodeForm.classList.remove('hidden');
    if (claimVerifyCodeForm) claimVerifyCodeForm.classList.add('hidden');
    if (devOtpBanner) devOtpBanner.classList.add('hidden');
    if (claimListingModalBackdrop) claimListingModalBackdrop.classList.remove('hidden');
  }

  if (closeClaimModalBtn) {
    closeClaimModalBtn.addEventListener('click', () => {
      if (claimListingModalBackdrop) claimListingModalBackdrop.classList.add('hidden');
    });
  }
  if (cancelClaimBtn) {
    cancelClaimBtn.addEventListener('click', () => {
      if (claimListingModalBackdrop) claimListingModalBackdrop.classList.add('hidden');
    });
  }
  if (backToClaimEmailBtn) {
    backToClaimEmailBtn.addEventListener('click', () => {
      if (claimSendCodeForm) claimSendCodeForm.classList.remove('hidden');
      if (claimVerifyCodeForm) claimVerifyCodeForm.classList.add('hidden');
    });
  }

  if (claimSendCodeForm) {
    claimSendCodeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cat = getActiveCategory();
      if (!cat || !activeClaimTarget) return;
      const email = claimWorkEmail?.value?.trim();
      if (!email) return;

      try {
        const res = await fetch('/api/claim/send-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categorySlug: cat.slug,
            productId: activeClaimTarget.id,
            workEmail: email
          })
        });
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'Could not send verification code');
          return;
        }

        if (claimSentEmailLabel) claimSentEmailLabel.textContent = email;
        claimSendCodeForm.classList.add('hidden');
        if (claimVerifyCodeForm) claimVerifyCodeForm.classList.remove('hidden');

        const otpCode = data.devCode || data.code;
        if (otpCode && devOtpBanner) {
          devOtpBanner.innerHTML = `Simulated Email Sent! Your 6-digit OTP code is: <strong>${escapeHtml(otpCode)}</strong>`;
          devOtpBanner.classList.remove('hidden');
          if (claimOtpInput) claimOtpInput.value = otpCode;
        }
        showToast(`Verification code sent to ${email}`);
      } catch {
        showToast('Network error sending code');
      }
    });
  }

  if (claimVerifyCodeForm) {
    claimVerifyCodeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cat = getActiveCategory();
      if (!cat || !activeClaimTarget) return;
      const code = claimOtpInput?.value?.trim();
      const email = claimWorkEmail?.value?.trim();

      try {
        const res = await fetch('/api/claim/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categorySlug: cat.slug,
            productId: activeClaimTarget.id,
            code,
            ownerName: currentUser ? currentUser.name : 'Verified Founder',
            ownerEmail: email
          })
        });
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'Verification failed');
          return;
        }

        appState = data.state;
        if (claimListingModalBackdrop) claimListingModalBackdrop.classList.add('hidden');
        showToast(`🎉 Verified! You have successfully claimed ${activeClaimTarget.name}.`);
        renderSingleListPage(getActiveCategory());
      } catch {
        showToast('Network error verifying code');
      }
    });
  }

  // =========================================================================
  // MODAL 9: 1-CLICK VIRAL SOCIAL SHARING ASSETS
  // =========================================================================
  function openShareRankingModal(cat, prod = null) {
    if (!cat) return;
    const isProd = Boolean(prod);
    const origin = window.location.origin;
    const shareUrl = isProd
      ? `${origin}/list/${cat.slug}#prod-card-${prod.id}`
      : `${origin}/list/${cat.slug}`;

    if (shareModalTitle) {
      shareModalTitle.textContent = isProd
        ? `Share #${prod.rank || 1} ${prod.name}`
        : `Share ${cat.title}`;
    }

    if (shareOgPreviewImg) {
      shareOgPreviewImg.src = `/api/og/${cat.slug}.svg`;
    }

    const copyText = isProd
      ? `Proud to announce that ${prod.name} is ranked #${prod.rank || 1} in Top 10 ${cat.title} of 2026! 🚀 Verified ratings, speed benchmarks & pricing teardown: ${shareUrl}`
      : `Top 10 ${cat.title} of 2026 — Verified comparisons, speed benchmarks, and pricing teardowns for modern engineering teams: ${shareUrl}`;

    if (sharePostCopyText) {
      sharePostCopyText.value = copyText;
    }

    if (shareTwitterBtn) {
      shareTwitterBtn.onclick = () => {
        const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(sharePostCopyText.value)}`;
        window.open(tweetUrl, '_blank', 'noopener,noreferrer');
      };
    }

    if (shareLinkedinBtn) {
      shareLinkedinBtn.onclick = () => {
        const liUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
        window.open(liUrl, '_blank', 'noopener,noreferrer');
      };
    }

    if (shareWhatsappBtn) {
      shareWhatsappBtn.onclick = () => {
        const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(sharePostCopyText.value)}`;
        window.open(waUrl, '_blank', 'noopener,noreferrer');
      };
    }

    if (shareCopyLinkBtn) {
      shareCopyLinkBtn.onclick = async () => {
        await copyTextWithFallback(sharePostCopyText.value);
        showToast('Copied viral social post & link to clipboard!');
      };
    }

    if (shareRankingModalBackdrop) {
      shareRankingModalBackdrop.classList.remove('hidden');
    }
  }

  if (openShareModalBtn) {
    openShareModalBtn.addEventListener('click', () => {
      openShareRankingModal(getActiveCategory());
    });
  }

  if (closeShareModalBtn) {
    closeShareModalBtn.addEventListener('click', () => {
      if (shareRankingModalBackdrop) shareRankingModalBackdrop.classList.add('hidden');
    });
  }

  // =========================================================================
  // VIEW 4B: HEAD-TO-HEAD COMPARISON VIEW (/compare/:catSlug/:slugA-vs-:slugB)
  // =========================================================================
  async function renderCompareHeadToHead(catSlug, slugA, slugB) {
    if (!compareHeadToHeadView) return;

    let cat = (appState?.categories || []).find((c) => c.slug === catSlug);
    if (!cat && appState?.categories?.[0]) cat = appState.categories[0];
    if (!cat) return;

    const allP = [...(cat.top10 || []), ...(cat.pushedOut || [])];
    const findProd = (idOrSlug) => {
      if (!idOrSlug) return null;
      const clean = idOrSlug.toLowerCase().replace(/[-_]/g, '');
      const raw = idOrSlug.toLowerCase().replace(/^prod_/, '').replace(/[^a-z0-9]/g, '');
      return allP.find(
        (p) =>
          p.id.toLowerCase().replace(/[-_]/g, '') === clean ||
          p.id.toLowerCase().replace(/^prod_/, '').replace(/[^a-z0-9]/g, '') === raw ||
          p.name.toLowerCase().replace(/[^a-z0-9]/g, '') === clean ||
          p.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(raw) ||
          (raw && p.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(raw.split(/[a-z0-9]{3}/)[0]))
      );
    };

    let prodA = findProd(slugA) || allP[0];
    let prodB = findProd(slugB) || (allP.length > 1 ? allP[1] : allP[0]);

    // Update Breadcrumb & Header
    if (compareCatNameCrumb) {
      compareCatNameCrumb.textContent = cat.title;
      compareCatNameCrumb.style.cursor = 'pointer';
      compareCatNameCrumb.onclick = () => navigateToCategory(cat.slug);
    }
    if (compareVersusTitle) {
      compareVersusTitle.textContent = `${prodA.name} vs ${prodB.name}`;
    }
    if (compareBackBtn) {
      compareBackBtn.onclick = () => navigateToCategory(cat.slug);
    }
    if (compareShareBtn) {
      compareShareBtn.onclick = () => {
        openShareRankingModal(cat, prodA);
      };
    }

    // Platform A Hero Column
    if (compareRankA) compareRankA.textContent = `#${prodA.rank || 1}`;
    if (compareLogoA) compareLogoA.innerHTML = renderBrandLogo(prodA, 28);
    if (compareNameA) compareNameA.textContent = prodA.name;
    if (compareCompanyA) compareCompanyA.textContent = `by ${prodA.companyName}`;
    if (compareTaglineA) compareTaglineA.textContent = prodA.tagline || 'Leading solution in category.';
    if (comparePriceA) comparePriceA.textContent = prodA.specs?.startingPrice || prodA.pricingTag || 'Custom Pricing';
    if (compareTrialA) compareTrialA.textContent = prodA.specs?.freeTrial || 'Free Sandbox / Trial';
    if (compareVisitBtnA) {
      compareVisitBtnA.href = prodA.website;
      compareVisitBtnA.textContent = `Visit ${prodA.name} ↗`;
    }

    // Platform B Hero Column
    if (compareRankB) compareRankB.textContent = `#${prodB.rank || 2}`;
    if (compareLogoB) compareLogoB.innerHTML = renderBrandLogo(prodB, 28);
    if (compareNameB) compareNameB.textContent = prodB.name;
    if (compareCompanyB) compareCompanyB.textContent = `by ${prodB.companyName}`;
    if (compareTaglineB) compareTaglineB.textContent = prodB.tagline || 'Leading solution in category.';
    if (comparePriceB) comparePriceB.textContent = prodB.specs?.startingPrice || prodB.pricingTag || 'Custom Pricing';
    if (compareTrialB) compareTrialB.textContent = prodB.specs?.freeTrial || 'Free Sandbox / Trial';
    if (compareVisitBtnB) {
      compareVisitBtnB.href = prodB.website;
      compareVisitBtnB.textContent = `Visit ${prodB.name} ↗`;
    }

    // Editorial Verdict Callout
    if (compareVerdictTitle) {
      compareVerdictTitle.textContent = `${prodA.name} vs ${prodB.name}: 2026 Editorial Verdict`;
    }
    if (compareVerdictBody) {
      const idealA = prodA.specs?.idealFor || 'teams needing developer flexibility and direct API control';
      const idealB = prodB.specs?.idealFor || 'companies prioritizing automated compliance and turn-key scale';
      compareVerdictBody.innerHTML = `Choose <strong>${escapeHtml(prodA.name)}</strong> if your priority is ${escapeHtml(idealA)}. Choose <strong>${escapeHtml(prodB.name)}</strong> if you prefer ${escapeHtml(idealB)}. Both are top-tier in <em>${escapeHtml(cat.title)}</em>, but their architectures serve distinct operating models.`;
    }
    if (compareWinnerDev) compareWinnerDev.textContent = prodA.name;
    if (compareWinnerValue) compareWinnerValue.textContent = prodB.name;

    // Feature Shootout Table
    if (thMatrixNameA) thMatrixNameA.textContent = prodA.name;
    if (thMatrixNameB) thMatrixNameB.textContent = prodB.name;
    if (compareMatrixTableBody) {
      const specsRows = [
        { label: 'Category Ranking', valA: `#${prodA.rank || 1} in ${cat.shortName || cat.title}`, valB: `#${prodB.rank || 2} in ${cat.shortName || cat.title}` },
        { label: 'Starting Price', valA: prodA.specs?.startingPrice || prodA.pricingTag || 'Contact Sales', valB: prodB.specs?.startingPrice || prodB.pricingTag || 'Contact Sales' },
        { label: 'Free Trial / Sandbox', valA: prodA.specs?.freeTrial || 'Yes', valB: prodB.specs?.freeTrial || 'Yes' },
        { label: 'Ideal Target Audience', valA: prodA.specs?.idealFor || 'Modern Engineering Teams', valB: prodB.specs?.idealFor || 'Enterprise Teams' },
        { label: 'Platform & API Architecture', valA: prodA.specs?.platforms || 'Cloud, Web, REST APIs', valB: prodB.specs?.platforms || 'Cloud, Web, REST APIs' },
        { label: 'Verified Reviews & Score', valA: `${prodA.commentCount || 0} reviews · ${(prodA.editorialScore || 9.4).toFixed(1)}/10`, valB: `${prodB.commentCount || 0} reviews · ${(prodB.editorialScore || 9.1).toFixed(1)}/10` },
        { label: 'Founder Verification', valA: prodA.claimed ? '✓ Verified Founder' : 'Curated Listing', valB: prodB.claimed ? '✓ Verified Founder' : 'Curated Listing' },
        { label: 'Sponsorship Status', valA: (prodA.amountPaid || 0) > 0 ? 'Sponsored (#1 Bidder)' : 'Organic Editorial', valB: (prodB.amountPaid || 0) > 0 ? 'Sponsored' : 'Organic Editorial' }
      ];

      compareMatrixTableBody.innerHTML = specsRows
        .map(
          (row) => `
          <tr>
            <td><strong>${escapeHtml(row.label)}</strong></td>
            <td>${escapeHtml(row.valA)}</td>
            <td>${escapeHtml(row.valB)}</td>
          </tr>
        `
        )
        .join('');
    }

    // Pros & Cons Shootout Cards
    if (pcTitleNameA) pcTitleNameA.textContent = prodA.name;
    if (pcTitleNameB) pcTitleNameB.textContent = prodB.name;
    if (pcContentA) {
      const prosA = (prodA.pros && prodA.pros.length) ? prodA.pros : ['High developer ergonomics', 'Extensive integration ecosystem'];
      const consA = (prodA.cons && prodA.cons.length) ? prodA.cons : ['Higher pricing at scale', 'Requires in-house technical setup'];
      pcContentA.innerHTML = `
        <div class="h2h-pc-pros">
          <div class="h2h-pc-sub" style="font-size:11px;font-weight:700;color:#059669;margin-bottom:6px;text-transform:uppercase;">Key Advantages</div>
          ${prosA.map((p) => `<div class="h2h-pc-bullet pro" style="font-size:12px;margin-bottom:4px;"><span class="pc-icon" style="color:#059669;font-weight:700;">✓</span> ${escapeHtml(p)}</div>`).join('')}
        </div>
        <div class="h2h-pc-cons" style="margin-top:12px;">
          <div class="h2h-pc-sub" style="font-size:11px;font-weight:700;color:#DC2626;margin-bottom:6px;text-transform:uppercase;">Tradeoffs to Consider</div>
          ${consA.map((c) => `<div class="h2h-pc-bullet con" style="font-size:12px;margin-bottom:4px;"><span class="pc-icon" style="color:#DC2626;font-weight:700;">✕</span> ${escapeHtml(c)}</div>`).join('')}
        </div>
      `;
    }
    if (pcContentB) {
      const prosB = (prodB.pros && prodB.pros.length) ? prodB.pros : ['Turn-key setup out of the box', 'Comprehensive global tax and compliance'];
      const consB = (prodB.cons && prodB.cons.length) ? prodB.cons : ['Slightly higher transaction fees', 'Fewer low-level customization endpoints'];
      pcContentB.innerHTML = `
        <div class="h2h-pc-pros">
          <div class="h2h-pc-sub" style="font-size:11px;font-weight:700;color:#059669;margin-bottom:6px;text-transform:uppercase;">Key Advantages</div>
          ${prosB.map((p) => `<div class="h2h-pc-bullet pro" style="font-size:12px;margin-bottom:4px;"><span class="pc-icon" style="color:#059669;font-weight:700;">✓</span> ${escapeHtml(p)}</div>`).join('')}
        </div>
        <div class="h2h-pc-cons" style="margin-top:12px;">
          <div class="h2h-pc-sub" style="font-size:11px;font-weight:700;color:#DC2626;margin-bottom:6px;text-transform:uppercase;">Tradeoffs to Consider</div>
          ${consB.map((c) => `<div class="h2h-pc-bullet con" style="font-size:12px;margin-bottom:4px;"><span class="pc-icon" style="color:#DC2626;font-weight:700;">✕</span> ${escapeHtml(c)}</div>`).join('')}
        </div>
      `;
    }

    // Alternative comparison chips in this category
    if (compareAltChips) {
      const top3 = (cat.top10 || []).slice(0, 4);
      const chipPairs = [];
      for (let i = 0; i < top3.length; i++) {
        for (let j = i + 1; j < top3.length; j++) {
          const p1 = top3[i];
          const p2 = top3[j];
          if ((p1.id === prodA.id && p2.id === prodB.id) || (p1.id === prodB.id && p2.id === prodA.id)) {
            continue;
          }
          chipPairs.push({ p1, p2 });
        }
      }
      compareAltChips.innerHTML = chipPairs
        .slice(0, 5)
        .map(
          ({ p1, p2 }) => `
        <button type="button" class="h2h-alt-chip" data-h2h-cat="${escapeHtml(cat.slug)}" data-h2h-a="${escapeHtml(p1.id)}" data-h2h-b="${escapeHtml(p2.id)}">
          ${escapeHtml(p1.name)} vs ${escapeHtml(p2.name)}
        </button>
      `
        )
        .join('');

      compareAltChips.querySelectorAll('[data-h2h-a]').forEach((chip) => {
        chip.addEventListener('click', () => {
          const cSlug = chip.getAttribute('data-h2h-cat');
          const aId = chip.getAttribute('data-h2h-a');
          const bId = chip.getAttribute('data-h2h-b');
          navigateToCompare(cSlug, aId, bId);
        });
      });
    }
  }

  // =========================================================================
  // MODAL 10: B2B ENTERPRISE CUSTOM QUOTES / RFP REQUEST
  // =========================================================================
  function openRequestRfpModal(cat, preselectedProdId = null) {
    if (!cat) return;
    if (rfpCategorySlug) rfpCategorySlug.value = cat.slug;
    if (rfpModalTitle) rfpModalTitle.textContent = `Request Custom Quotes — ${cat.title}`;

    if (currentUser) {
      if (rfpBuyerName && !rfpBuyerName.value) rfpBuyerName.value = currentUser.name || '';
      if (rfpBuyerEmail && !rfpBuyerEmail.value) rfpBuyerEmail.value = currentUser.email || '';
      if (rfpCompanyName && !rfpCompanyName.value) rfpCompanyName.value = currentUser.company || '';
    }

    selectedRfpVendors.clear();
    const allP = [...(cat.top10 || []), ...(cat.pushedOut || [])];

    if (preselectedProdId) {
      selectedRfpVendors.add(preselectedProdId);
    } else {
      // Default select top 3
      (cat.top10 || []).slice(0, 3).forEach((p) => selectedRfpVendors.add(p.id));
    }

    if (rfpVendorsPicker) {
      rfpVendorsPicker.innerHTML = allP.slice(0, 6).map((p) => `
        <button
          type="button"
          class="rfp-vendor-chip ${selectedRfpVendors.has(p.id) ? 'active' : ''}"
          data-rfp-vendor="${escapeHtml(p.id)}"
        >
          <span>#${p.rank || '-'} ${escapeHtml(p.name)}</span>
        </button>
      `).join('');

      rfpVendorsPicker.querySelectorAll('[data-rfp-vendor]').forEach((chip) => {
        chip.addEventListener('click', () => {
          const vId = chip.getAttribute('data-rfp-vendor');
          if (selectedRfpVendors.has(vId)) {
            if (selectedRfpVendors.size > 1) {
              selectedRfpVendors.delete(vId);
              chip.classList.remove('active');
            } else {
              showToast('At least 1 platform must be selected');
            }
          } else {
            selectedRfpVendors.add(vId);
            chip.classList.add('active');
          }
        });
      });
    }

    if (requestRfpModalBackdrop) requestRfpModalBackdrop.classList.remove('hidden');
  }

  if (openCategoryRfpBtn) {
    openCategoryRfpBtn.addEventListener('click', () => {
      openRequestRfpModal(getActiveCategory());
    });
  }
  if (closeRfpModalBtn) {
    closeRfpModalBtn.addEventListener('click', () => {
      if (requestRfpModalBackdrop) requestRfpModalBackdrop.classList.add('hidden');
    });
  }
  if (cancelRfpModalBtn) {
    cancelRfpModalBtn.addEventListener('click', () => {
      if (requestRfpModalBackdrop) requestRfpModalBackdrop.classList.add('hidden');
    });
  }

  if (requestRfpForm) {
    requestRfpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const catSlug = rfpCategorySlug?.value;
      const cat = (appState?.categories || []).find((c) => c.slug === catSlug) || getActiveCategory();
      if (!cat) return;

      const allP = [...(cat.top10 || []), ...(cat.pushedOut || [])];
      const selectedNames = [...selectedRfpVendors].map((id) => {
        const found = allP.find((p) => p.id === id);
        return found ? found.name : id;
      });

      const payload = {
        categorySlug: cat.slug,
        buyerName: rfpBuyerName?.value?.trim() || 'Enterprise Buyer',
        buyerEmail: rfpBuyerEmail?.value?.trim() || '',
        companyName: rfpCompanyName?.value?.trim() || '',
        teamSize: rfpTeamSize?.value || '11-50 employees',
        estimatedBudget: rfpEstimatedBudget?.value || '$500-$2,000/mo',
        timeline: rfpTimeline?.value || 'Within 1 month',
        selectedPlatforms: selectedNames,
        projectRequirements: rfpNotes?.value?.trim() || 'Looking for pricing breakdown and product demo.'
      };

      try {
        const res = await fetch('/api/leads/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'Failed to submit quote request');
          return;
        }

        if (requestRfpModalBackdrop) requestRfpModalBackdrop.classList.add('hidden');
        showToast('🎉 RFP submitted! Verified vendors will reach out with custom quotes.');
        if (data.state) appState = data.state;
      } catch {
        showToast('Network error submitting RFP request');
      }
    });
  }

  // =========================================================================
  // MODAL 11: FOUNDER SELF-SERVE PORTAL & LISTING SPECS EDITOR
  // =========================================================================
  async function openFounderPortal(targetProdId = null) {
    try {
      const emailQuery = currentUser?.email ? `?email=${encodeURIComponent(currentUser.email)}` : '';
      const res = await fetch(`/api/founder/portal-data${emailQuery}`);
      founderPortalData = await res.json();

      const products = founderPortalData.products || [];
      if (products.length === 0) {
        showToast('No claimed platforms found. Click "Claim" on your platform card first.');
        return;
      }

      if (founderProductSelect) {
        founderProductSelect.innerHTML = products
          .map(
            (p) => `<option value="${escapeHtml(p.id)}" data-cat="${escapeHtml(p.categorySlug)}">${escapeHtml(p.name)} (#${p.rank || '-'} in ${escapeHtml(p.categoryTitle || p.categorySlug)})</option>`
          )
          .join('');

        if (targetProdId) {
          founderProductSelect.value = targetProdId;
        }
      }

      loadSelectedFounderProduct();
      if (founderPortalModalBackdrop) founderPortalModalBackdrop.classList.remove('hidden');
    } catch {
      showToast('Error opening Founder Portal');
    }
  }

  function loadSelectedFounderProduct() {
    if (!founderPortalData) return;
    const selectedId = founderProductSelect?.value;
    const prod = (founderPortalData.products || []).find((p) => p.id === selectedId) || founderPortalData.products?.[0];
    if (!prod) return;

    // Fill KPI Metrics
    if (founderMetricViews) founderMetricViews.textContent = (prod.views || 480).toLocaleString();
    if (founderMetricClicks) founderMetricClicks.textContent = (prod.clicks || 34).toLocaleString();
    if (founderMetricCtr) founderMetricCtr.textContent = prod.ctr || '7.1%';
    if (founderMetricSaves) {
      const savesCount = [...savedProductIds].filter((id) => id === prod.id).length;
      founderMetricSaves.textContent = savesCount > 0 ? savesCount + 12 : 12;
    }

    // Fill Spec Editor Form
    if (fEditCategorySlug) fEditCategorySlug.value = prod.categorySlug || currentCategorySlug;
    if (fEditProductId) fEditProductId.value = prod.id;
    if (fEditName) fEditName.value = prod.name || '';
    if (fEditWebsite) fEditWebsite.value = prod.website || '';
    if (fEditTagline) fEditTagline.value = prod.tagline || '';
    if (fEditPrice) fEditPrice.value = prod.specs?.startingPrice || prod.pricingTag || '';
    if (fEditTrial) fEditTrial.value = prod.specs?.freeTrial || '';
    if (fEditIdealFor) fEditIdealFor.value = prod.specs?.idealFor || '';
    if (fEditPlatforms) fEditPlatforms.value = prod.specs?.platforms || '';
    if (fEditPro1) fEditPro1.value = prod.pros?.[0] || '';
    if (fEditPro2) fEditPro2.value = prod.pros?.[1] || '';
    if (fEditCon1) fEditCon1.value = prod.cons?.[0] || '';
    if (fEditCon2) fEditCon2.value = prod.cons?.[1] || '';
    if (fEditHeroImage) fEditHeroImage.value = prod.media?.heroImage || '';
    if (fEditOverlayTag) fEditOverlayTag.value = prod.media?.overlayTag || '';

    // Retainer Subscription status box
    const sub = prod.retainerSubscription;
    if (sub && sub.status === 'active') {
      if (founderSubBadge) {
        founderSubBadge.textContent = 'Active Sponsorship';
        founderSubBadge.style.background = '#059669';
      }
      if (founderSubTitle) founderSubTitle.textContent = sub.tierName || 'Lock #1 for 30 Days';
      if (founderSubDesc) founderSubDesc.textContent = `Active PayPal Subscription (${sub.id}). Your rank is guaranteed against outbids.`;
      if (founderSubPrice) founderSubPrice.innerHTML = `$${sub.amount}<span style="font-size:12px;font-weight:normal;">/mo</span>`;
      if (founderCancelSubBtn) founderCancelSubBtn.classList.remove('hidden');
    } else {
      if (founderSubBadge) {
        founderSubBadge.textContent = 'Standard Organic Listing';
        founderSubBadge.style.background = '#6B7280';
      }
      if (founderSubTitle) founderSubTitle.textContent = 'No Active Sponsorship Retainer';
      if (founderSubDesc) founderSubDesc.textContent = 'Lock #1 or guarantee Top 3 placement to protect against competitor outbids and unlock qualified buyer leads.';
      if (founderSubPrice) founderSubPrice.innerHTML = `$0<span style="font-size:12px;font-weight:normal;">/mo</span>`;
      if (founderCancelSubBtn) founderCancelSubBtn.classList.add('hidden');
    }

    // Category Buyer Leads Feed
    const leads = (founderPortalData.leads || []).filter((l) => l.categorySlug === prod.categorySlug);
    if (founderLeadsBadge) founderLeadsBadge.textContent = leads.length;
    if (founderLeadsList) {
      if (leads.length === 0) {
        founderLeadsList.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12.5px;">No buyer RFP requests in this directory yet. New RFPs will appear here automatically.</div>`;
      } else {
        founderLeadsList.innerHTML = leads.map((lead) => `
          <div class="f-lead-card">
            <div class="flc-header">
              <div>
                <strong>${escapeHtml(lead.companyName)}</strong>
                <span style="font-size:11px;color:var(--text-muted);margin-left:6px;">(${escapeHtml(lead.teamSize)})</span>
              </div>
              <span class="flc-budget-pill">${escapeHtml(lead.estimatedBudget)}</span>
            </div>
            <div class="flc-body">
              <div style="font-size:12px;color:var(--text-secondary);margin:4px 0;"><strong>Timeline:</strong> ${escapeHtml(lead.timeline)} · <strong>Vendors requested:</strong> ${(lead.selectedPlatforms || []).join(', ')}</div>
              <div style="font-size:11.5px;color:var(--text-muted);font-style:italic;">"${escapeHtml(lead.projectRequirements || 'Evaluating pricing and demo.')}"</div>
            </div>
            <div class="flc-footer" style="margin-top:8px;display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:11.5px;">
                ${lead.isUnlocked
                  ? `<span style="color:#059669;font-weight:600;">Contact: ${escapeHtml(lead.buyerEmail)} (${escapeHtml(lead.buyerName)})</span>`
                  : `<span style="color:var(--text-muted);">Contact: ${escapeHtml(lead.buyerEmail ? lead.buyerEmail.replace(/^(.).*(@.*)$/, '$1***$2') : 'Protected')}</span>`
                }
              </span>
              ${lead.isUnlocked
                ? `<span class="verified-claim-badge">Unlocked ✓</span>`
                : `<button type="button" class="btn-unlock-lead" data-unlock-lead="${escapeHtml(lead.id)}">Unlock Contact ($49)</button>`
              }
            </div>
          </div>
        `).join('');

        founderLeadsList.querySelectorAll('[data-unlock-lead]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const leadId = btn.getAttribute('data-unlock-lead');
            try {
              const res = await fetch(`/api/leads/${leadId}/unlock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId: prod.id })
              });
              const data = await res.json();
              if (res.ok) {
                showToast(`🎉 Contact Unlocked! Buyer email: ${data.lead?.buyerEmail || 'Revealed'}`);
                openFounderPortal(prod.id);
              } else {
                showToast(data.error || 'Failed to unlock lead');
              }
            } catch {
              showToast('Network error unlocking lead');
            }
          });
        });
      }
    }
  }

  // Founder Product Dropdown change listener
  if (founderProductSelect) {
    founderProductSelect.addEventListener('change', () => {
      loadSelectedFounderProduct();
    });
  }

  // Founder Portal Tabs Switcher
  if (founderPortalTabs) {
    founderPortalTabs.querySelectorAll('[data-founder-tab]').forEach((tab) => {
      tab.addEventListener('click', () => {
        activeFounderTab = tab.getAttribute('data-founder-tab');
        founderPortalTabs.querySelectorAll('[data-founder-tab]').forEach((t) => t.classList.toggle('active', t === tab));
        if (founderEditorForm) founderEditorForm.classList.toggle('hidden', activeFounderTab !== 'editor');
        if (founderRetainerPanel) founderRetainerPanel.classList.toggle('hidden', activeFounderTab !== 'retainer');
        if (founderLeadsPanel) founderLeadsPanel.classList.toggle('hidden', activeFounderTab !== 'leads');
      });
    });
  }

  // Founder Editor Form Submit
  if (founderEditorForm) {
    founderEditorForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        categorySlug: fEditCategorySlug?.value,
        productId: fEditProductId?.value,
        name: fEditName?.value?.trim(),
        website: fEditWebsite?.value?.trim(),
        tagline: fEditTagline?.value?.trim(),
        specs: {
          startingPrice: fEditPrice?.value?.trim() || 'Free Sandbox',
          freeTrial: fEditTrial?.value?.trim() || '14-Day Free Trial',
          idealFor: fEditIdealFor?.value?.trim() || 'Modern Teams',
          platforms: fEditPlatforms?.value?.trim() || 'Web & Cloud APIs'
        },
        pros: [fEditPro1?.value?.trim(), fEditPro2?.value?.trim()].filter(Boolean),
        cons: [fEditCon1?.value?.trim(), fEditCon2?.value?.trim()].filter(Boolean),
        heroImage: fEditHeroImage?.value?.trim() || '',
        overlayTag: fEditOverlayTag?.value?.trim() || ''
      };

      try {
        const res = await fetch('/api/founder/update-product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'Failed to update listing specifications');
          return;
        }

        if (data.state) appState = data.state;
        showToast('✓ Specifications updated & published live!');
        if (currentView === 'list') {
          renderSingleListPage(getActiveCategory());
        }
      } catch {
        showToast('Network error saving specifications');
      }
    });
  }

  // Founder PayPal Subscription Retainer Handlers
  if (fBtnUpgradeLock1) {
    fBtnUpgradeLock1.addEventListener('click', async () => {
      const selectedId = founderProductSelect?.value;
      const catSlug = fEditCategorySlug?.value || currentCategorySlug;
      try {
        const res = await fetch('/api/paypal/create-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categorySlug: catSlug,
            productId: selectedId,
            tier: 'lock_rank_1'
          })
        });
        const data = await res.json();
        if (data.success) {
          showToast('🎉 Lock #1 ($299/mo) Sponsorship Retainer activated via PayPal!');
          openFounderPortal(selectedId);
        } else {
          showToast(data.error || 'Failed to create PayPal retainer');
        }
      } catch {
        showToast('Network error creating retainer subscription');
      }
    });
  }

  if (fBtnUpgradeTop3) {
    fBtnUpgradeTop3.addEventListener('click', async () => {
      const selectedId = founderProductSelect?.value;
      const catSlug = fEditCategorySlug?.value || currentCategorySlug;
      try {
        const res = await fetch('/api/paypal/create-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categorySlug: catSlug,
            productId: selectedId,
            tier: 'guaranteed_top_3'
          })
        });
        const data = await res.json();
        if (data.success) {
          showToast('🎉 Guaranteed Top 3 ($149/mo) Retainer activated via PayPal!');
          openFounderPortal(selectedId);
        } else {
          showToast(data.error || 'Failed to create PayPal retainer');
        }
      } catch {
        showToast('Network error creating retainer subscription');
      }
    });
  }

  if (founderCancelSubBtn) {
    founderCancelSubBtn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to cancel your PayPal sponsorship retainer? Your guaranteed placement will expire.')) return;
      const selectedId = founderProductSelect?.value;
      try {
        const res = await fetch('/api/paypal/cancel-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: selectedId })
        });
        const data = await res.json();
        if (res.ok) {
          showToast('Sponsorship retainer canceled successfully');
          openFounderPortal(selectedId);
        } else {
          showToast(data.error || 'Failed to cancel subscription');
        }
      } catch {
        showToast('Network error canceling subscription');
      }
    });
  }

  if (navFounderPortalBtn) {
    navFounderPortalBtn.addEventListener('click', () => {
      openFounderPortal();
    });
  }
  if (closeFounderPortalBtn) {
    closeFounderPortalBtn.addEventListener('click', () => {
      if (founderPortalModalBackdrop) founderPortalModalBackdrop.classList.add('hidden');
    });
  }

  // Minimalist Floating Back-to-Top Pill on Deep Scroll
  if (backToTopPill) {
    window.addEventListener(
      'scroll',
      () => {
        backToTopPill.classList.toggle('hidden', window.scrollY < 520);
      },
      { passive: true }
    );
    backToTopPill.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  clearBigSearchBtn.addEventListener('click', () => {
    homeBigSearchInput.value = '';
    renderHomePage();
    homeBigSearchInput.focus();
  });

  nfCreateListPaywallBtn.addEventListener('click', () => {
    openCreateListPaywallModal(homeBigSearchInput.value.trim());
  });

  dropdownCreateListBtn.addEventListener('click', () => {
    categoryDropdownMenu.classList.add('hidden');
    openCreateListPaywallModal('');
  });

  if (openBidModalBtn) {
    openBidModalBtn.addEventListener('click', () => openBidModal(1));
  }
  if (heroBigAddPlatformBtn) {
    heroBigAddPlatformBtn.addEventListener('click', () => openBidModal(1));
  }
  if (footerBrandSubmitBtn) {
    footerBrandSubmitBtn.addEventListener('click', () => openBidModal(1));
  }
  if (toggleMoreListingsBtn && moreListingsTimeline) {
    toggleMoreListingsBtn.addEventListener('click', () => {
      const isHidden = moreListingsTimeline.classList.contains('hidden');
      moreListingsTimeline.classList.toggle('hidden', !isHidden);
      toggleMoreListingsBtn.textContent = isHidden
        ? 'Hide extra listings ▴'
        : 'Show all listings ▾';
    });
  }

  closeBidModalBtn.addEventListener('click', () => bidModalBackdrop.classList.add('hidden'));
  cancelBidModalBtn.addEventListener('click', () => bidModalBackdrop.classList.add('hidden'));

  bidPaymentAmount.addEventListener('input', () => {
    const cat = getActiveCategory();
    if (cat) updateSimulatedRankBanner(cat, bidPaymentAmount.value);
  });

  bidCheckoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cat = getActiveCategory();
    if (!cat) return;

    if (currentBidMode === 'retainer') {
      const prodId = bidRetainerProductSelect ? bidRetainerProductSelect.value : null;
      const allProds = [...(cat.top10 || []), ...(cat.pushedOut || [])];
      const targetProd = allProds.find((p) => p.id === prodId) || allProds[0];
      const tierTitle = selectedRetainerTier === 'lock_rank_1' ? 'Lock #1 for 30 Days ($299/mo)' : 'Guaranteed Top 3 ($149/mo)';

      const res = await fetch('/api/paypal/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categorySlug: cat.slug,
          productId: targetProd ? targetProd.id : null,
          tier: selectedRetainerTier,
          ownerEmail: bidOwnerEmail?.value?.trim() || currentUser?.email || 'founder@company.com',
          authorName: currentUser ? currentUser.name : (targetProd ? targetProd.name : 'Founder')
        })
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Could not create PayPal retainer subscription');
        return;
      }

      appState = data.state;
      bidModalBackdrop.classList.add('hidden');
      bidCheckoutForm.reset();
      navigateToCategory(cat.slug);
      showToast(`Subscribed via PayPal! ${tierTitle} active for ${targetProd ? targetProd.name : 'Platform'}.`);
      return;
    }

    let payload;
    let toastLabel = '';
    if (currentBidMode === 'existing' && bidExistingProductSelect) {
      const existingId = bidExistingProductSelect.value;
      const allProds = [...(cat.top10 || []), ...(cat.pushedOut || [])];
      const existingProd = allProds.find((p) => p.id === existingId);
      toastLabel = existingProd ? existingProd.name : 'Platform';
      payload = {
        existingProductId: existingId,
        paymentAmount: Number(bidPaymentAmount.value || 49),
        ownerEmail: bidOwnerEmail.value.trim() || 'founder@company.com',
        authorName: currentUser ? currentUser.name : toastLabel
      };
    } else {
      const pName = bidProductName.value.trim();
      toastLabel = pName;
      payload = {
        name: pName,
        companyName: bidCompanyName.value.trim() || `${pName} Inc`,
        website: bidWebsite.value.trim(),
        pricingTag: bidPricingTag.value.trim() || 'Free trial / Custom',
        highlightTag: bidHighlightTag.value.trim() || '@Featured',
        ownerEmail: bidOwnerEmail.value.trim() || 'founder@company.com',
        tagline: bidTagline.value.trim(),
        paymentAmount: Number(bidPaymentAmount.value || 49),
        authorName: currentUser ? currentUser.name : pName
      };
    }

    const res = await fetch(`/api/categories/${cat.slug}/bid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Could not process submission');
      return;
    }

    appState = data.state;
    bidModalBackdrop.classList.add('hidden');
    bidCheckoutForm.reset();
    if (bidUrlFaviconPreview) bidUrlFaviconPreview.textContent = '🌐';
    navigateToCategory(cat.slug);
    showToast(
      currentBidMode === 'existing'
        ? `Boosted ${toastLabel} in ${cat.title}!`
        : `${toastLabel} added to ${cat.title}!`
    );
  });

  // Create List Paywall Form Submit
  closeCreateListModalBtn.addEventListener('click', () => createListModalBackdrop.classList.add('hidden'));
  cancelCreateListModalBtn.addEventListener('click', () => createListModalBackdrop.classList.add('hidden'));

  createListPaywallForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pName = newListProdName.value.trim();
    const payload = {
      title: newListTitleInput.value.trim(),
      productName: pName,
      companyName: newListCompany.value.trim() || `${pName} Inc`,
      website: newListWebsite.value.trim(),
      pricingTag: newListPricing.value.trim() || 'Free trial / Custom',
      highlightTag: newListHighlight.value.trim() || '@Featured',
      ownerEmail: newListEmail.value.trim() || 'founder@company.com',
      tagline: newListTagline.value.trim(),
      paywallFee: Number(newListFeeInput.value || 99)
    };

    const res = await fetch('/api/lists/create-paid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Could not create guide');
      return;
    }

    appState = data.state;
    createListModalBackdrop.classList.add('hidden');
    createListPaywallForm.reset();
    homeBigSearchInput.value = '';
    navigateToCategory(data.category.slug);
    showToast(`Launched "${data.category.title}"!`);
  });

  // Dropdown toggles
  categoryDropdownBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    categoryDropdownMenu.classList.toggle('hidden');
    if (userDropdownMenu) userDropdownMenu.classList.add('hidden');
  });

  if (userAvatarBtn) {
    userAvatarBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openAccountModal();
    });
  }

  // Topbar Navigation Links
  if (navGuidesBtn) navGuidesBtn.addEventListener('click', () => navigateToHome());
  if (navBlogBtn) navBlogBtn.addEventListener('click', () => navigateToBlog());
  if (navAdminBtn) navAdminBtn.addEventListener('click', () => navigateToAdmin());
  if (adminExitBtn) adminExitBtn.addEventListener('click', () => navigateToHome());
  if (articleBackToBlogBtn) articleBackToBlogBtn.addEventListener('click', () => navigateToBlog());

  document.addEventListener('click', (e) => {
    categoryDropdownMenu.classList.add('hidden');
    if (userDropdownMenu) userDropdownMenu.classList.add('hidden');
    if (homeLiveSearchDropdown && !e.target.closest('.big-search-wrap')) {
      homeLiveSearchDropdown.classList.add('hidden');
    }
    if (topbarLiveSearchDropdown && !e.target.closest('.topbar-search-wrap')) {
      topbarLiveSearchDropdown.classList.add('hidden');
    }
  });

  categoryDropdownMenu.addEventListener('click', (e) => e.stopPropagation());
  if (userDropdownMenu) userDropdownMenu.addEventListener('click', (e) => e.stopPropagation());

  // Tabs on Single List Page
  document.querySelectorAll('.subnav-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentTab = btn.getAttribute('data-tab');
      updateTabVisibility();
    });
  });

  if (refreshStateBtn) {
    refreshStateBtn.addEventListener('click', () => {
      fetchState();
      showToast('Guide refreshed');
    });
  }

  // Comments & Context
  if (commentSearchInput) {
    commentSearchInput.addEventListener('input', () => {
      const cat = getActiveCategory();
      if (cat) renderContextStream(cat);
    });
  }

  if (commentTypeFilter) {
    commentTypeFilter.addEventListener('change', () => {
      const cat = getActiveCategory();
      if (cat) renderContextStream(cat);
    });
  }

  if (attachDemoFileBtn) {
    attachDemoFileBtn.addEventListener('click', () => {
      const demoFiles = [
        { name: '2026_Pricing_Benchmark.xlsx', type: 'xlsx' },
        { name: 'Feature_Evaluation_Notes.pdf', type: 'pdf' }
      ];
      const pick = demoFiles[pendingAttachments.length % demoFiles.length];
      pendingAttachments.push(pick);
      renderPendingAttachments();
    });
  }

  function renderPendingAttachments() {
    if (!composerAttachmentsPreview) return;
    if (pendingAttachments.length === 0) {
      composerAttachmentsPreview.classList.add('hidden');
      composerAttachmentsPreview.innerHTML = '';
      return;
    }
    composerAttachmentsPreview.classList.remove('hidden');
    composerAttachmentsPreview.innerHTML = pendingAttachments
      .map(
        (f, idx) => `
        <span class="file-chip">
          <span class="file-chip-icon ${f.type}">${f.type.toUpperCase()}</span>
          <span>${escapeHtml(f.name)}</span>
          <button type="button" data-rm-file="${idx}" style="border:none;background:none;cursor:pointer;color:#6B7280;margin-left:4px;">&times;</button>
        </span>
      `
      )
      .join('');

    composerAttachmentsPreview.querySelectorAll('[data-rm-file]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.getAttribute('data-rm-file'));
        pendingAttachments.splice(i, 1);
        renderPendingAttachments();
      });
    });
  }

  if (commentForm) {
    commentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!commentTextarea) return;
      let text = commentTextarea.value.trim();
      if (!text) return;
      const cat = getActiveCategory();
      if (!cat) return;

      const taggedProd = commentProductTag ? commentProductTag.value.trim() : '';
      if (taggedProd && !text.toLowerCase().includes(taggedProd.toLowerCase())) {
        text = `@${taggedProd} — ${text}`;
      }

      const res = await fetch(`/api/categories/${cat.slug}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorName: currentUser ? currentUser.name : 'Verified Reader',
          authorRole: currentUser ? currentUser.company : 'Buyer',
          avatarBg: currentUser ? currentUser.avatarBg : '#111827',
          avatarText: currentUser ? currentUser.avatarText : 'VR',
          text,
          attachments: pendingAttachments
        })
      });

      const data = await res.json();
      if (data.state) {
        appState = data.state;
        if (commentTextarea) commentTextarea.value = '';
        if (commentProductTag) commentProductTag.value = '';
        pendingAttachments = [];
        renderPendingAttachments();
        renderSingleListPage(getActiveCategory());
        showToast('Review posted');
      }
    });
  }

  // Login Modal
  if (openCustomLoginBtn) {
    openCustomLoginBtn.addEventListener('click', () => {
      if (userDropdownMenu) userDropdownMenu.classList.add('hidden');
      loginModalBackdrop.classList.remove('hidden');
    });
  }

  if (closeLoginModalBtn) closeLoginModalBtn.addEventListener('click', () => loginModalBackdrop.classList.add('hidden'));
  if (cancelLoginModalBtn) cancelLoginModalBtn.addEventListener('click', () => loginModalBackdrop.classList.add('hidden'));

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const loginErrorMsg = document.getElementById('loginErrorMsg');
      if (loginErrorMsg) loginErrorMsg.classList.add('hidden');

      const passInput = document.getElementById('loginPassword');
      const password = passInput ? passInput.value.trim() : '';

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: loginName.value.trim(),
            email: loginEmail.value.trim(),
            company: loginCompany.value.trim(),
            password
          })
        });
        const data = await res.json();
        if (!res.ok) {
          if (loginErrorMsg) {
            loginErrorMsg.textContent = data.error || 'Failed to sign in';
            loginErrorMsg.classList.remove('hidden');
          } else {
            showToast(data.error || 'Failed to sign in');
          }
          return;
        }
        if (data.user) {
          currentUser = data.user;
          if (data.token) localStorage.setItem('top10_token', data.token);
          if (data.state) appState = data.state;
          loginModalBackdrop.classList.add('hidden');
          loginForm.reset();
          renderAll();
          showToast(`Signed in as ${currentUser.name}`);
        }
      } catch (err) {
        if (loginErrorMsg) {
          loginErrorMsg.textContent = 'Network error while signing in';
          loginErrorMsg.classList.remove('hidden');
        }
      }
    });
  }

  // =========================================================================
  // EDITORIAL BLOG ENGINE (/blog & /blog/:slug)
  // =========================================================================
  function renderBlogIndex() {
    if (!blogIndexSection || !appState) return;
    const articles = appState.articles || [];
    if (articles.length === 0) return;

    if (blogTotalCountBadge) {
      blogTotalCountBadge.textContent = `${articles.length} Buying Guides`;
    }

    const lead = articles[0];
    if (blogFeaturedLead && lead) {
      blogFeaturedLead.innerHTML = `
        <img src="${escapeHtml(lead.coverImage)}" alt="${escapeHtml(lead.title)}" class="lead-cover-img" loading="eager" />
        <div class="lead-content">
          <div class="lead-meta-row">
            <span class="lead-category-tag">${escapeHtml(lead.categoryName)}</span>
            <span>•</span>
            <span>${escapeHtml(lead.readTime)}</span>
            <span>•</span>
            <span>${escapeHtml(lead.publishedDate)}</span>
          </div>
          <h2 class="lead-title">${escapeHtml(lead.title)}</h2>
          <p class="lead-excerpt">${escapeHtml(lead.subtitle)}</p>
          <div class="lead-author-row">
            <div class="author-chip">
              <span class="author-chip-avatar">${escapeHtml((lead.author || 'A')[0])}</span>
              <span>By <strong>${escapeHtml(lead.author)}</strong></span>
            </div>
            <span class="lead-read-link">Read Buying Guide →</span>
          </div>
        </div>
      `;
      blogFeaturedLead.onclick = () => navigateToArticle(lead.slug);
    }

    if (blogCardsGrid) {
      const rest = articles.slice(1);
      blogCardsGrid.innerHTML = rest
        .map(
          (a) => `
        <article class="blog-card" data-blog-slug="${escapeHtml(a.slug)}">
          <img src="${escapeHtml(a.coverImage)}" alt="${escapeHtml(a.title)}" class="blog-card-thumb" loading="lazy" />
          <div class="blog-card-body">
            <div class="blog-card-meta">
              <span class="lead-category-tag">${escapeHtml(a.categoryName)}</span>
              <span>•</span>
              <span>${escapeHtml(a.readTime)}</span>
            </div>
            <h3 class="blog-card-title">${escapeHtml(a.title)}</h3>
            <p class="blog-card-excerpt">${escapeHtml(a.subtitle)}</p>
            <div class="blog-card-footer">
              <span>By ${escapeHtml(a.author)}</span>
              <span class="lead-read-link">Read →</span>
            </div>
          </div>
        </article>
      `
        )
        .join('');

      blogCardsGrid.querySelectorAll('[data-blog-slug]').forEach((card) => {
        card.addEventListener('click', () => {
          const s = card.getAttribute('data-blog-slug');
          navigateToArticle(s);
        });
      });
    }
  }

  function renderBlogArticle(slug) {
    if (!blogArticleSection || !appState) return;
    const articles = appState.articles || [];
    const article = articles.find((a) => a.slug === slug) || articles[0];
    if (!article) return;

    if (articleBreadcrumbCat) articleBreadcrumbCat.textContent = article.categoryName;
    if (articleMetaCategory) articleMetaCategory.textContent = article.categoryName;
    if (articleMetaReadTime) articleMetaReadTime.textContent = article.readTime;
    if (articleMetaDate) articleMetaDate.textContent = article.publishedDate;
    if (articleMainTitle) articleMainTitle.textContent = article.title;
    if (articleMainSubtitle) articleMainSubtitle.textContent = article.subtitle;
    if (articleAuthorName) articleAuthorName.textContent = article.author;
    if (articleAuthorBio) articleAuthorBio.textContent = article.authorBio;
    if (articleAuthorAvatar) articleAuthorAvatar.textContent = (article.author[0] || 'A').toUpperCase();

    // Takeaways list
    if (articleTakeawaysList) {
      articleTakeawaysList.innerHTML = (article.keyTakeaways || article.takeaways || [])
        .map((t) => `<li>${escapeHtml(t)}</li>`)
        .join('');
    }

    // Body content (simple markdown or HTML to clean display)
    if (articleBodyContent) {
      const raw = article.content || article.contentHtml || article.body || '';
      const html = raw.startsWith('<')
        ? raw
        : raw
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\n\n+/g, '</p><p>')
            .replace(/^(?!<[hbu]|<block)(.+)$/gim, '<p>$1</p>');
      articleBodyContent.innerHTML = html;
    }

    // Featured Top 10 Products Strip
    if (articleFeaturedStrip && articleFeaturedProductsGrid) {
      const targetCat = (appState.categories || []).find((c) => c.slug === article.categorySlug);
      if (targetCat) {
        articleFeaturedStrip.classList.remove('hidden');
        if (articleViewFullListBtn) {
          articleViewFullListBtn.onclick = () => navigateToCategory(targetCat.slug);
        }
        const top3 = (targetCat.top10 || []).slice(0, 3);
        articleFeaturedProductsGrid.innerHTML = top3
          .map(
            (p) => `
          <div class="afs-product-card" data-afs-cat="${escapeHtml(targetCat.slug)}" data-afs-prod="${escapeHtml(p.id)}">
            <span class="afs-prod-rank">Rank #${p.rank} · ${escapeHtml(p.companyName)}</span>
            <div class="afs-prod-name">${escapeHtml(p.name)}</div>
            <div class="afs-prod-price">${escapeHtml(p.pricingTag || 'Transparent Pricing')}</div>
          </div>
        `
          )
          .join('');

        articleFeaturedProductsGrid.querySelectorAll('.afs-product-card').forEach((card) => {
          card.addEventListener('click', () => {
            const cSlug = card.getAttribute('data-afs-cat');
            navigateToCategory(cSlug);
          });
        });
      } else {
        articleFeaturedStrip.classList.add('hidden');
      }
    }
  }

  // =========================================================================
  // ADMIN OPERATIONS COMMAND CENTER (/admin)
  // =========================================================================
  let activeAdminTab = 'products';

  function renderAdminPanel() {
    if (!adminViewSection || !appState) return;

    // Platform KPIs
    let totalRev = 0;
    let totalProds = 0;
    (appState.categories || []).forEach((c) => {
      const prods = [...(c.top10 || []), ...(c.pushedOut || [])];
      totalProds += prods.length;
      prods.forEach((p) => {
        totalRev += (p.amountPaid || 0);
      });
    });

    const txs = appState.transactions || [];
    txs.forEach((t) => {
      if (t.type === 'create_list' || t.amount === 99) {
        totalRev += (t.amount || 99);
      }
    });

    const leads = appState.buyerLeads || [];

    if (adminKpiRevenue) adminKpiRevenue.textContent = `$${totalRev.toLocaleString()}`;
    if (adminKpiCategories) adminKpiCategories.textContent = String((appState.categories || []).length);
    if (adminKpiProducts) adminKpiProducts.textContent = String(totalProds);
    if (adminKpiLeads) adminKpiLeads.textContent = String(leads.length);

    if (adminCategoryFilterSelect) {
      const cur = adminCategoryFilterSelect.value || 'all';
      adminCategoryFilterSelect.innerHTML = `<option value="all">All Categories (${(appState.categories || []).length})</option>` +
        (appState.categories || [])
          .map((c) => `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.title)}</option>`)
          .join('');
      adminCategoryFilterSelect.value = cur;
    }

    renderAdminOverview();
    renderAdminProductsTable();
    renderAdminCategoriesTable();
    renderAdminBlogs();
    renderAdminTransactionsTable();
    renderAdminSubscriptionsTable();
    renderAdminReviews();
    renderAdminLeads();
  }

  // Admin Tab Switcher
  document.querySelectorAll('.admin-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      activeAdminTab = tab.getAttribute('data-admin-tab');
      document.querySelectorAll('.admin-tab').forEach((t) => t.classList.toggle('active', t === tab));
      
      const tabMap = {
        overview: 'adminTabOverview',
        products: 'adminTabProducts',
        categories: 'adminTabCategories',
        blogs: 'adminTabBlogs',
        transactions: 'adminTabTransactions',
        reviews: 'adminTabReviews',
        leads: 'adminTabLeads'
      };

      Object.entries(tabMap).forEach(([tKey, elId]) => {
        const el = document.getElementById(elId);
        if (el) el.classList.toggle('hidden', activeAdminTab !== tKey);
      });

      if (activeAdminTab === 'overview') renderAdminOverview();
      if (activeAdminTab === 'products') renderAdminProductsTable();
      if (activeAdminTab === 'categories') renderAdminCategoriesTable();
      if (activeAdminTab === 'blogs') renderAdminBlogs();
      if (activeAdminTab === 'transactions') {
        renderAdminTransactionsTable();
        renderAdminSubscriptionsTable();
      }
      if (activeAdminTab === 'reviews') renderAdminReviews();
      if (activeAdminTab === 'leads') renderAdminLeads();
    });
  });

  if (adminProductSearchInput) {
    adminProductSearchInput.addEventListener('input', () => renderAdminProductsTable());
  }
  if (adminCategoryFilterSelect) {
    adminCategoryFilterSelect.addEventListener('change', () => renderAdminProductsTable());
  }

  const adminCategorySearchInput = document.getElementById('adminCategorySearchInput');
  if (adminCategorySearchInput) {
    adminCategorySearchInput.addEventListener('input', () => renderAdminCategoriesTable());
  }

  const adminBlogSearchInput = document.getElementById('adminBlogSearchInput');
  const adminBlogCategoryFilterSelect = document.getElementById('adminBlogCategoryFilterSelect');
  if (adminBlogSearchInput) {
    adminBlogSearchInput.addEventListener('input', () => renderAdminBlogs());
  }
  if (adminBlogCategoryFilterSelect) {
    adminBlogCategoryFilterSelect.addEventListener('change', () => renderAdminBlogs());
  }

  // -------------------------------------------------------------------------
  // 1. Platform Overview & Monetization Analytics
  // -------------------------------------------------------------------------
  async function renderAdminOverview() {
    try {
      const res = await fetch('/api/admin/analytics');
      if (!res.ok) return;
      const data = await res.json();
      const ov = data.overview || {};
      const streams = data.revenueByStream || {};

      const dashHeroTotalRevenue = document.getElementById('dashHeroTotalRevenue');
      const dashHeroMrrSub = document.getElementById('dashHeroMrrSub');
      const dashRevLaunches = document.getElementById('dashRevLaunches');
      const dashCountLaunches = document.getElementById('dashCountLaunches');
      const dashRevBids = document.getElementById('dashRevBids');
      const dashCountBids = document.getElementById('dashCountBids');
      const dashRevMrr = document.getElementById('dashRevMrr');
      const dashCountRetainers = document.getElementById('dashCountRetainers');
      const dashRevLeads = document.getElementById('dashRevLeads');
      const dashCountLeads = document.getElementById('dashCountLeads');
      const dashTrafficViews = document.getElementById('dashTrafficViews');
      const dashOutboundClicks = document.getElementById('dashOutboundClicks');
      const dashCtrVal = document.getElementById('dashCtrVal');
      const dashActiveDirs = document.getElementById('dashActiveDirs');
      const dashPublishedArticles = document.getElementById('dashPublishedArticles');
      const dashCategoryPerfTableBody = document.getElementById('dashCategoryPerfTableBody');
      const dashSalesFeedContainer = document.getElementById('dashSalesFeedContainer');

      if (dashHeroTotalRevenue) dashHeroTotalRevenue.textContent = `$${(ov.totalRevenue || 0).toLocaleString()}`;
      if (dashHeroMrrSub) dashHeroMrrSub.textContent = `$${(ov.mrr || 0).toLocaleString()}/mo Recurring MRR (${ov.activeSubscriptionsCount || 0} active)`;

      if (dashRevLaunches) dashRevLaunches.textContent = `$${(streams.launches?.total || 0).toLocaleString()}`;
      if (dashCountLaunches) dashCountLaunches.textContent = `${streams.launches?.count || 0} launches recorded`;

      if (dashRevBids) dashRevBids.textContent = `$${(streams.bids?.total || 0).toLocaleString()}`;
      if (dashCountBids) dashCountBids.textContent = `${streams.bids?.count || 0} placement bids`;

      if (dashRevMrr) dashRevMrr.textContent = `$${(ov.mrr || 0).toLocaleString()}/mo`;
      if (dashCountRetainers) dashCountRetainers.textContent = `${ov.activeSubscriptionsCount || 0} active retainers`;

      if (dashRevLeads) dashRevLeads.textContent = `$${(streams.leadUnlocks?.total || 0).toLocaleString()}`;
      if (dashCountLeads) dashCountLeads.textContent = `${streams.leadUnlocks?.count || 0} leads unlocked ($49/ea)`;

      if (dashTrafficViews) dashTrafficViews.textContent = (ov.totalDirectoryViews || 0).toLocaleString();
      if (dashOutboundClicks) dashOutboundClicks.textContent = (ov.totalClicks || 0).toLocaleString();
      if (dashCtrVal) dashCtrVal.textContent = ov.ctr || '3.85%';
      if (dashActiveDirs) dashActiveDirs.textContent = String(ov.totalCategories || (appState.categories || []).length);
      if (dashPublishedArticles) dashPublishedArticles.textContent = String(ov.totalArticles || (appState.articles || []).length);

      // Render category performance rows
      if (dashCategoryPerfTableBody && Array.isArray(data.categoryBreakdown)) {
        dashCategoryPerfTableBody.innerHTML = data.categoryBreakdown
          .slice(0, 8)
          .map(
            (c) => `
          <tr>
            <td>
              <span style="font-size:16px;margin-right:6px;">${escapeHtml(c.icon || '📁')}</span>
              <strong>${escapeHtml(c.title)}</strong>
            </td>
            <td>${(c.monthlyViews || 0).toLocaleString()}</td>
            <td>${c.productCount || 0}</td>
            <td><strong style="color:#10B981;">$${(c.categoryRevenue || 0).toLocaleString()}</strong></td>
            <td>
              <span class="admin-pill-tag sponsored">${escapeHtml(c.topProduct || 'Organic')}</span>
              ${c.topBid > 0 ? `<span style="font-size:11px;color:var(--text-muted);margin-left:4px;">($${c.topBid})</span>` : ''}
            </td>
          </tr>
        `
          )
          .join('');
      }

      // Render real-time sales stream
      if (dashSalesFeedContainer && Array.isArray(data.recentTransactions)) {
        if (data.recentTransactions.length === 0) {
          dashSalesFeedContainer.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px;">No sales activity recorded yet.</div>`;
        } else {
          dashSalesFeedContainer.innerHTML = data.recentTransactions
            .map((t) => {
              let badgeCls = 'bid';
              let badgeTxt = 'Placement Bid';
              if (t.type === 'list_creation') {
                badgeCls = 'launch';
                badgeTxt = '$99 Launch';
              } else if (t.type === 'retainer_subscription' || t.type === 'retainer_renewal') {
                badgeCls = 'sub';
                badgeTxt = 'MRR Retainer';
              } else if (t.type === 'lead_unlock') {
                badgeCls = 'lead';
                badgeTxt = 'Lead Unlock';
              }

              const d = new Date(t.timestamp || t.createdAt || Date.now());
              return `
              <div class="dash-sales-feed-item">
                <div class="sales-feed-left">
                  <span class="sales-feed-badge ${badgeCls}">${badgeTxt}</span>
                  <div>
                    <div class="sales-feed-desc">${escapeHtml(t.productName || t.description || 'Verified Placement')}</div>
                    <div class="sales-feed-time">${escapeHtml(t.categorySlug || 'Directory')} · ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
                <div class="sales-feed-amt">+$${(t.amount || 0).toLocaleString()}</div>
              </div>
            `;
            })
            .join('');
        }
      }
    } catch (e) {
      console.warn('Failed to load admin analytics:', e.message);
    }
  }

  // -------------------------------------------------------------------------
  // 2. Product & Bid Master Controller
  // -------------------------------------------------------------------------
  function renderAdminProductsTable() {
    if (!adminProductsTableBody || !appState) return;
    const q = (adminProductSearchInput?.value || '').toLowerCase().trim();
    const catFilter = adminCategoryFilterSelect?.value || 'all';

    const rows = [];
    (appState.categories || []).forEach((c) => {
      if (catFilter !== 'all' && c.slug !== catFilter) return;
      const allP = [...(c.top10 || []), ...(c.pushedOut || [])];
      allP.forEach((p) => {
        if (
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.companyName.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          (p.ownerEmail || '').toLowerCase().includes(q)
        ) {
          rows.push({ prod: p, cat: c });
        }
      });
    });

    if (rows.length === 0) {
      adminProductsTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">No products match your filter.</td></tr>`;
      return;
    }

    adminProductsTableBody.innerHTML = rows
      .map(
        ({ prod, cat }) => `
      <tr>
        <td><strong>#${prod.rank || '-'}</strong></td>
        <td>
          <div style="font-weight:650;">${escapeHtml(prod.name)}</div>
          <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(prod.companyName || prod.company || prod.name)}</div>
        </td>
        <td><span style="font-size:11.5px;color:var(--text-secondary);">${escapeHtml(cat.title)}</span></td>
        <td>
          ${
            (prod.amountPaid || 0) > 0
              ? `<span class="admin-pill-tag sponsored">Sponsored</span>`
              : `<span class="admin-pill-tag organic">Organic</span>`
          }
        </td>
        <td><strong>$${(prod.amountPaid || 0).toLocaleString()}</strong></td>
        <td><span style="color:var(--text-muted);">${escapeHtml(prod.pricingTag || '—')}</span></td>
        <td>
          <button type="button" class="admin-btn-action admin-prod-edit-btn" data-edit-prod-id="${escapeHtml(prod.id)}" data-edit-prod-cat="${escapeHtml(cat.slug)}">✏️ Edit</button>
          <button type="button" class="admin-btn-action" data-admin-edit-prod="${escapeHtml(prod.id)}" data-admin-cat="${escapeHtml(cat.slug)}">Bid $</button>
          ${
            (prod.amountPaid || 0) > 0
              ? `<button type="button" class="admin-btn-action reset-bid" data-admin-reset-prod="${escapeHtml(prod.id)}" data-admin-cat="${escapeHtml(cat.slug)}">Reset</button>`
              : ''
          }
          <button type="button" class="admin-btn-action admin-btn-danger del-prod" data-admin-del-prod="${escapeHtml(prod.id)}" data-admin-cat="${escapeHtml(cat.slug)}">✕</button>
        </td>
      </tr>
    `
      )
      .join('');

    // Wire Edit Product
    adminProductsTableBody.querySelectorAll('.admin-prod-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pId = btn.getAttribute('data-edit-prod-id');
        const cSlug = btn.getAttribute('data-edit-prod-cat');
        const cat = (appState.categories || []).find((c) => c.slug === cSlug);
        if (cat) {
          const prod = (cat.products || []).find((p) => p.id === pId) || (cat.top10 || []).find((p) => p.id === pId);
          if (prod) openAdminProductEditorModal(cSlug, prod);
        }
      });
    });

    // Wire Edit Bid Prompt
    adminProductsTableBody.querySelectorAll('[data-admin-edit-prod]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const prodId = btn.getAttribute('data-admin-edit-prod');
        const cSlug = btn.getAttribute('data-admin-cat');
        const cat = (appState.categories || []).find((c) => c.slug === cSlug);
        const prod = (cat?.products || []).find((p) => p.id === prodId) || (cat?.top10 || []).find((p) => p.id === prodId);
        if (!prod) return;

        const newAmt = prompt(`Update bid for ${prod.name} in ${cat.title} (USD $):`, prod.amountPaid || 0);
        if (newAmt === null) return;
        const parsedAmt = parseFloat(newAmt);
        if (isNaN(parsedAmt) || parsedAmt < 0) return alert('Please enter a valid amount');

        try {
          const res = await fetch('/api/admin/product/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              categorySlug: cSlug,
              productId: prodId,
              amountPaid: parsedAmt
            })
          });
          const data = await res.json();
          if (data.state) {
            appState = data.state;
            renderAdminPanel();
            showToast(`Updated bid for ${prod.name} to $${parsedAmt}`);
          }
        } catch (err) {
          alert('Failed to update bid: ' + err.message);
        }
      });
    });

    // Wire Reset Bid
    adminProductsTableBody.querySelectorAll('[data-admin-reset-prod]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const prodId = btn.getAttribute('data-admin-reset-prod');
        const cSlug = btn.getAttribute('data-admin-cat');
        if (!confirm('Reset this product to organic ($0 bid)?')) return;
        try {
          const res = await fetch('/api/admin/product/reset-bid', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categorySlug: cSlug, productId: prodId })
          });
          const data = await res.json();
          if (data.state) {
            appState = data.state;
            renderAdminPanel();
            showToast('Reset product to organic');
          }
        } catch (err) {
          alert('Failed to reset: ' + err.message);
        }
      });
    });

    // Wire Delete Product
    adminProductsTableBody.querySelectorAll('.del-prod').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const prodId = btn.getAttribute('data-admin-del-prod');
        const cSlug = btn.getAttribute('data-admin-cat');
        if (!confirm('Remove this product permanently from the directory?')) return;
        try {
          const res = await fetch(`/api/admin/categories/${cSlug}/products/${prodId}`, {
            method: 'DELETE'
          });
          const data = await res.json();
          if (data.state) {
            appState = data.state;
            renderAdminPanel();
            showToast('Product removed');
          }
        } catch (err) {
          alert('Failed to delete product: ' + err.message);
        }
      });
    });
  }

  // -------------------------------------------------------------------------
  // 3. Category & Directory Manager
  // -------------------------------------------------------------------------
  function renderAdminCategoriesTable() {
    if (!adminCategoriesTableBody || !appState) return;
    const q = (adminCategorySearchInput?.value || '').toLowerCase().trim();
    let cats = appState.categories || [];

    if (q) {
      cats = cats.filter((c) => c.title.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q));
    }

    adminCategoriesTableBody.innerHTML = cats
      .map(
        (c) => `
      <tr>
        <td>
          <span class="entity-logo-lg" style="width:24px;height:24px;border-radius:6px;background:${escapeHtml(c.iconBg || '#111827')};color:${escapeHtml(c.iconColor || '#fff')};">
            ${renderCategorySvgIcon(c, 13)}
          </span>
        </td>
        <td><strong>${escapeHtml(c.title)}</strong></td>
        <td><code>/list/${escapeHtml(c.slug)}</code></td>
        <td>${(c.products || []).length} listings</td>
        <td>${escapeHtml(c.metrics?.monthlyViews || c.monthlyViews || '65.2k')}</td>
        <td>
          <button type="button" class="admin-btn-action admin-cat-add-prod-btn" data-add-prod-cat="${escapeHtml(c.slug)}">+ Add Product</button>
          <button type="button" class="admin-btn-action admin-cat-edit-btn" data-edit-cat="${escapeHtml(c.slug)}">✏️ Edit</button>
          <button type="button" class="admin-btn-action" data-admin-view-cat="${escapeHtml(c.slug)}">View Page →</button>
          <button type="button" class="admin-btn-action admin-btn-danger admin-cat-del-btn" data-del-cat="${escapeHtml(c.slug)}">✕</button>
        </td>
      </tr>
    `
      )
      .join('');

    // Wire Add Product to category
    adminCategoriesTableBody.querySelectorAll('.admin-cat-add-prod-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slug = btn.getAttribute('data-add-prod-cat');
        openAdminProductEditorModal(slug);
      });
    });

    // Wire Edit Category
    adminCategoriesTableBody.querySelectorAll('.admin-cat-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slug = btn.getAttribute('data-edit-cat');
        const cat = (appState.categories || []).find((c) => c.slug === slug);
        if (cat) openCategoryEditorModal(cat);
      });
    });

    // Wire View Category (preserves existing test selector)
    adminCategoriesTableBody.querySelectorAll('[data-admin-view-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slug = btn.getAttribute('data-admin-view-cat');
        navigateToCategory(slug);
      });
    });

    // Wire Delete Category
    adminCategoriesTableBody.querySelectorAll('.admin-cat-del-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const slug = btn.getAttribute('data-del-cat');
        if (!confirm(`Delete directory "${slug}" and all its rankings?`)) return;
        try {
          const res = await fetch(`/api/admin/categories/${slug}`, { method: 'DELETE' });
          const data = await res.json();
          if (data.state) {
            appState = data.state;
            renderAdminPanel();
            showToast('Directory removed');
          }
        } catch (err) {
          alert('Failed to delete directory: ' + err.message);
        }
      });
    });
  }

  // -------------------------------------------------------------------------
  // 4. Blog & Editorial Manager
  // -------------------------------------------------------------------------
  function renderAdminBlogs() {
    const adminBlogsTableBody = document.getElementById('adminBlogsTableBody');
    const adminArticlesCountBadge = document.getElementById('adminArticlesCountBadge');
    if (!adminBlogsTableBody || !appState) return;

    const articles = appState.articles || [];
    if (adminArticlesCountBadge) {
      adminArticlesCountBadge.textContent = String(articles.length);
    }

    if (adminBlogCategoryFilterSelect) {
      const cur = adminBlogCategoryFilterSelect.value || 'all';
      const uniqueCats = Array.from(new Set(articles.map((a) => a.category).filter(Boolean)));
      adminBlogCategoryFilterSelect.innerHTML = `<option value="all">All Blog Categories (${articles.length})</option>` +
        uniqueCats.map((cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('');
      adminBlogCategoryFilterSelect.value = cur;
    }

    const q = (adminBlogSearchInput?.value || '').toLowerCase().trim();
    const catFilter = adminBlogCategoryFilterSelect?.value || 'all';

    const filtered = articles.filter((a) => {
      if (catFilter !== 'all' && a.category !== catFilter) return false;
      if (!q) return true;
      const authorStr = typeof a.author === 'object' ? a.author.name : a.author || '';
      return (
        (a.title || '').toLowerCase().includes(q) ||
        (a.subtitle || '').toLowerCase().includes(q) ||
        (a.slug || '').toLowerCase().includes(q) ||
        authorStr.toLowerCase().includes(q)
      );
    });

    if (filtered.length === 0) {
      adminBlogsTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">No blog articles found. Click "+ Write New Article" to publish your first teardown.</td></tr>`;
      return;
    }

    adminBlogsTableBody.innerHTML = filtered
      .map((a) => {
        const authorName = typeof a.author === 'object' ? a.author.name : a.author || 'Editorial Team';
        return `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:20px;">${escapeHtml(a.coverEmoji || a.coverIcon || '📝')}</span>
              <div>
                <strong style="font-size:13px;display:block;color:var(--text-main);">${escapeHtml(a.title)}</strong>
                <span style="font-size:11px;color:var(--text-muted);">${escapeHtml(a.subtitle || '')}</span>
              </div>
            </div>
          </td>
          <td><code>/blog/${escapeHtml(a.slug)}</code></td>
          <td><span class="admin-pill-tag organic">${escapeHtml(a.category || 'Buyer Guides')}</span></td>
          <td>
            <div style="font-weight:600;font-size:12px;">${escapeHtml(authorName)}</div>
            <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(a.readTime || '6 min read')}</div>
          </td>
          <td><span class="admin-pill-tag sponsored">${escapeHtml(a.status || 'published')}</span></td>
          <td>
            <button type="button" class="admin-btn-action admin-blog-edit-btn" data-edit-blog="${escapeHtml(a.slug)}">✏️ Edit</button>
            <button type="button" class="admin-btn-action admin-blog-view-btn" data-view-blog="${escapeHtml(a.slug)}">👁️ View</button>
            <button type="button" class="admin-btn-action admin-btn-danger admin-blog-del-btn" data-del-blog="${escapeHtml(a.slug)}">✕</button>
          </td>
        </tr>
      `;
      })
      .join('');

    // Wire Edit Blog
    adminBlogsTableBody.querySelectorAll('.admin-blog-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slug = btn.getAttribute('data-edit-blog');
        const art = (appState.articles || []).find((a) => a.slug === slug);
        if (art) openBlogEditorModal(art);
      });
    });

    // Wire View Blog
    adminBlogsTableBody.querySelectorAll('.admin-blog-view-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slug = btn.getAttribute('data-view-blog');
        navigateToArticle(slug);
      });
    });

    // Wire Delete Blog
    adminBlogsTableBody.querySelectorAll('.admin-blog-del-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const slug = btn.getAttribute('data-del-blog');
        if (!confirm(`Delete article "${slug}" permanently?`)) return;
        try {
          const res = await fetch(`/api/blog/${slug}`, { method: 'DELETE' });
          const data = await res.json();
          if (data.state) {
            appState = data.state;
            renderAdminPanel();
            showToast('Article deleted');
          }
        } catch (err) {
          alert('Failed to delete article: ' + err.message);
        }
      });
    });
  }

  // -------------------------------------------------------------------------
  // 5. Active PayPal Retainer Subscriptions (MRR)
  // -------------------------------------------------------------------------
  function renderAdminSubscriptionsTable() {
    const adminSubscriptionsTableBody = document.getElementById('adminSubscriptionsTableBody');
    if (!adminSubscriptionsTableBody || !appState) return;

    const subs = appState.subscriptions || [];
    if (subs.length === 0) {
      adminSubscriptionsTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">No recurring subscriptions active. Founders can subscribe to "Lock #1" or "Guaranteed Top 3".</td></tr>`;
      return;
    }

    adminSubscriptionsTableBody.innerHTML = subs
      .map((s) => {
        const isLock1 = s.tier === 'top1' || (s.monthlyAmount && s.monthlyAmount >= 299);
        const tierBadge = isLock1
          ? `<span class="rtc-badge gold" style="font-size:10px;padding:2px 8px;">👑 Lock #1</span>`
          : `<span class="rtc-badge blue" style="font-size:10px;padding:2px 8px;">⭐ Guaranteed Top 3</span>`;

        const renewalDate = s.renewsAt ? new Date(s.renewsAt).toLocaleDateString() : 'In 30 days';
        const statusBadge = s.status === 'active'
          ? `<span style="color:#059669;font-weight:700;">● Active</span>`
          : `<span style="color:#DC2626;font-weight:600;">Cancelled</span>`;

        return `
        <tr>
          <td><code>${escapeHtml(s.id || 'sub_paypal')}</code></td>
          <td>
            <strong>${escapeHtml(s.productName || s.brandName || 'Sponsor')}</strong>
            <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(s.ownerEmail || '')}</div>
          </td>
          <td><code>/list/${escapeHtml(s.categorySlug || '—')}</code></td>
          <td>${tierBadge}</td>
          <td><strong>$${(s.monthlyAmount || (isLock1 ? 299 : 149)).toLocaleString()}/mo</strong></td>
          <td style="font-size:12px;color:var(--text-secondary);">${renewalDate}</td>
          <td>${statusBadge}</td>
        </tr>
      `;
      })
      .join('');
  }

  // -------------------------------------------------------------------------
  // 6. Interactive Modals: Directory, Blog, Product Controllers
  // -------------------------------------------------------------------------

  // A. Category / Directory Editor Modal
  const categoryEditorModalBackdrop = document.getElementById('categoryEditorModalBackdrop');
  const categoryEditorForm = document.getElementById('categoryEditorForm');
  const catModalHeading = document.getElementById('catModalHeading');
  const catEditTitle = document.getElementById('catEditTitle');
  const catEditSlug = document.getElementById('catEditSlug');
  const catEditIcon = document.getElementById('catEditIcon');
  const catEditViews = document.getElementById('catEditViews');
  const catEditTagline = document.getElementById('catEditTagline');
  const catEditDescription = document.getElementById('catEditDescription');
  const catEditCriteria = document.getElementById('catEditCriteria');
  const catEditFaqs = document.getElementById('catEditFaqs');
  const catEditIsUpdate = document.getElementById('catEditIsUpdate');
  const catEditOriginalSlug = document.getElementById('catEditOriginalSlug');
  const closeCategoryEditorModalBtn = document.getElementById('closeCategoryEditorModalBtn');
  const cancelCategoryEditorBtn = document.getElementById('cancelCategoryEditorBtn');
  const adminHeaderNewCatBtn = document.getElementById('adminHeaderNewCatBtn');

  function openCategoryEditorModal(cat = null) {
    if (!categoryEditorModalBackdrop) return;
    if (cat) {
      catModalHeading.textContent = `Edit Directory: ${cat.title}`;
      catEditIsUpdate.value = 'true';
      catEditOriginalSlug.value = cat.slug;
      catEditTitle.value = cat.title || '';
      catEditSlug.value = cat.slug || '';
      catEditIcon.value = cat.icon || '📁';
      catEditViews.value = cat.monthlyViews || 12000;
      catEditTagline.value = cat.tagline || cat.subtitle || '';
      catEditDescription.value = cat.description || '';
      catEditCriteria.value = Array.isArray(cat.criteria) ? cat.criteria.join('\n') : '';
      catEditFaqs.value = Array.isArray(cat.faqs) ? cat.faqs.map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n\n') : '';
    } else {
      catModalHeading.textContent = 'Create New Top 10 Directory';
      catEditIsUpdate.value = 'false';
      catEditOriginalSlug.value = '';
      categoryEditorForm.reset();
      catEditIcon.value = '📁';
      catEditViews.value = 15000;
    }
    categoryEditorModalBackdrop.classList.remove('hidden');
  }

  function closeCategoryEditorModal() {
    if (categoryEditorModalBackdrop) categoryEditorModalBackdrop.classList.add('hidden');
  }

  if (closeCategoryEditorModalBtn) closeCategoryEditorModalBtn.addEventListener('click', closeCategoryEditorModal);
  if (cancelCategoryEditorBtn) cancelCategoryEditorBtn.addEventListener('click', closeCategoryEditorModal);
  if (adminHeaderNewCatBtn) adminHeaderNewCatBtn.addEventListener('click', () => openCategoryEditorModal());
  if (adminNewCategoryBtn) adminNewCategoryBtn.addEventListener('click', () => openCategoryEditorModal());

  if (catEditTitle) {
    catEditTitle.addEventListener('input', () => {
      if (catEditIsUpdate.value !== 'true') {
        catEditSlug.value = catEditTitle.value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
      }
    });
  }

  if (categoryEditorForm) {
    categoryEditorForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const isUpdate = catEditIsUpdate.value === 'true';
      const origSlug = catEditOriginalSlug.value;

      let slug = catEditSlug.value.trim();
      if (!slug) {
        slug = catEditTitle.value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
      }

      const criteria = catEditCriteria.value
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const faqs = [];
      const faqBlocks = catEditFaqs.value.split(/\n\s*\n/);
      faqBlocks.forEach((block) => {
        const qMatch = block.match(/Q:\s*(.+)/i);
        const aMatch = block.match(/A:\s*(.+)/is);
        if (qMatch && aMatch) {
          faqs.push({ q: qMatch[1].trim(), a: aMatch[1].trim() });
        }
      });

      const payload = {
        title: catEditTitle.value.trim(),
        slug,
        icon: catEditIcon.value.trim() || '📁',
        monthlyViews: Number(catEditViews.value) || 12000,
        tagline: catEditTagline.value.trim(),
        description: catEditDescription.value.trim(),
        criteria: criteria.length > 0 ? criteria : undefined,
        faqs: faqs.length > 0 ? faqs : undefined
      };

      try {
        const url = isUpdate ? `/api/admin/categories/${origSlug}` : '/api/admin/categories';
        const method = isUpdate ? 'PUT' : 'POST';
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save directory');

        if (data.state) appState = data.state;
        closeCategoryEditorModal();
        renderAdminPanel();
        showToast(isUpdate ? `Directory "${payload.title}" updated!` : `New Directory "${payload.title}" created!`);
      } catch (err) {
        alert(err.message);
      }
    });
  }

  // B. Blog / Editorial Article Editor Modal
  const blogEditorModalBackdrop = document.getElementById('blogEditorModalBackdrop');
  const blogEditorForm = document.getElementById('blogEditorForm');
  const blogModalHeading = document.getElementById('blogModalHeading');
  const blogEditTitle = document.getElementById('blogEditTitle');
  const blogEditSlug = document.getElementById('blogEditSlug');
  const blogEditSubtitle = document.getElementById('blogEditSubtitle');
  const blogEditCategorySelect = document.getElementById('blogEditCategorySelect');
  const blogEditAuthorName = document.getElementById('blogEditAuthorName');
  const blogEditCoverEmoji = document.getElementById('blogEditCoverEmoji');
  const blogEditReadTime = document.getElementById('blogEditReadTime');
  const blogEditTakeaways = document.getElementById('blogEditTakeaways');
  const blogEditContent = document.getElementById('blogEditContent');
  const blogEditIsUpdate = document.getElementById('blogEditIsUpdate');
  const blogEditOriginalSlug = document.getElementById('blogEditOriginalSlug');
  const blogTabWriteBtn = document.getElementById('blogTabWriteBtn');
  const blogTabPreviewBtn = document.getElementById('blogTabPreviewBtn');
  const blogWritePane = document.getElementById('blogWritePane');
  const blogPreviewPane = document.getElementById('blogPreviewPane');
  const closeBlogEditorModalBtn = document.getElementById('closeBlogEditorModalBtn');
  const cancelBlogEditorBtn = document.getElementById('cancelBlogEditorBtn');
  const adminHeaderNewBlogBtn = document.getElementById('adminHeaderNewBlogBtn');
  const adminNewBlogBtn = document.getElementById('adminNewBlogBtn');

  function openBlogEditorModal(article = null) {
    if (!blogEditorModalBackdrop) return;

    if (blogEditCategorySelect && appState.categories) {
      blogEditCategorySelect.innerHTML = appState.categories
        .map((c) => `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.title)}</option>`)
        .join('');
    }

    if (article) {
      blogModalHeading.textContent = `Edit Article: ${article.title}`;
      blogEditIsUpdate.value = 'true';
      blogEditOriginalSlug.value = article.slug;
      blogEditTitle.value = article.title || '';
      blogEditSlug.value = article.slug || '';
      blogEditSubtitle.value = article.subtitle || '';
      if (blogEditCategorySelect && article.categorySlug) blogEditCategorySelect.value = article.categorySlug;
      blogEditAuthorName.value = typeof article.author === 'object' ? article.author.name : article.author || 'Sarah Jenkins';
      blogEditCoverEmoji.value = article.coverEmoji || article.coverIcon || '📝';
      blogEditReadTime.value = article.readTime || '6 min read';
      blogEditTakeaways.value = Array.isArray(article.takeaways || article.keyTakeaways)
        ? (article.takeaways || article.keyTakeaways).join('\n')
        : '';
      blogEditContent.value = article.content || article.contentHtml || '';
    } else {
      blogModalHeading.textContent = 'Write New Editorial Article';
      blogEditIsUpdate.value = 'false';
      blogEditOriginalSlug.value = '';
      blogEditorForm.reset();
      blogEditCoverEmoji.value = '⚡';
      blogEditReadTime.value = '6 min read';
      blogEditAuthorName.value = 'Sarah Jenkins';
    }

    if (blogTabWriteBtn && blogTabPreviewBtn) {
      blogTabWriteBtn.classList.add('active');
      blogTabPreviewBtn.classList.remove('active');
      blogWritePane.classList.remove('hidden');
      blogPreviewPane.classList.add('hidden');
    }

    blogEditorModalBackdrop.classList.remove('hidden');
  }

  function closeBlogEditorModal() {
    if (blogEditorModalBackdrop) blogEditorModalBackdrop.classList.add('hidden');
  }

  if (closeBlogEditorModalBtn) closeBlogEditorModalBtn.addEventListener('click', closeBlogEditorModal);
  if (cancelBlogEditorBtn) cancelBlogEditorBtn.addEventListener('click', closeBlogEditorModal);
  if (adminHeaderNewBlogBtn) adminHeaderNewBlogBtn.addEventListener('click', () => openBlogEditorModal());
  if (adminNewBlogBtn) adminNewBlogBtn.addEventListener('click', () => openBlogEditorModal());

  if (blogTabWriteBtn && blogTabPreviewBtn) {
    blogTabWriteBtn.addEventListener('click', () => {
      blogTabWriteBtn.classList.add('active');
      blogTabPreviewBtn.classList.remove('active');
      blogWritePane.classList.remove('hidden');
      blogPreviewPane.classList.add('hidden');
    });

    blogTabPreviewBtn.addEventListener('click', () => {
      blogTabPreviewBtn.classList.add('active');
      blogTabWriteBtn.classList.remove('active');
      blogWritePane.classList.add('hidden');
      blogPreviewPane.classList.remove('hidden');

      const raw = blogEditContent.value || '*(No content written yet)*';
      const previewHtml = raw
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n\n+/g, '</p><p>');
      blogPreviewPane.innerHTML = `<p>${previewHtml}</p>`;
    });
  }

  if (blogEditTitle) {
    blogEditTitle.addEventListener('input', () => {
      if (blogEditIsUpdate.value !== 'true') {
        blogEditSlug.value = blogEditTitle.value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
      }
    });
  }

  if (blogEditorForm) {
    blogEditorForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const isUpdate = blogEditIsUpdate.value === 'true';
      const origSlug = blogEditOriginalSlug.value;

      const takeaways = blogEditTakeaways.value
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const selCatSlug = blogEditCategorySelect?.value || 'billing-software';
      const selCat = (appState.categories || []).find((c) => c.slug === selCatSlug);

      const payload = {
        title: blogEditTitle.value.trim(),
        slug: blogEditSlug.value.trim(),
        subtitle: blogEditSubtitle.value.trim(),
        category: selCat ? selCat.title : 'Buyer Guides',
        categorySlug: selCatSlug,
        author: blogEditAuthorName.value.trim() || 'Sarah Jenkins',
        authorRole: 'Lead Technical Researcher',
        coverEmoji: blogEditCoverEmoji.value.trim() || '📝',
        readTime: blogEditReadTime.value.trim() || '6 min read',
        takeaways,
        keyTakeaways: takeaways,
        content: blogEditContent.value,
        contentHtml: blogEditContent.value,
        status: 'published'
      };

      try {
        const url = isUpdate ? `/api/blog/${origSlug}` : '/api/blog';
        const method = isUpdate ? 'PUT' : 'POST';
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save article');

        if (data.state) appState = data.state;
        closeBlogEditorModal();
        renderAdminPanel();
        showToast(isUpdate ? `Article "${payload.title}" updated!` : `Article "${payload.title}" published!`);
      } catch (err) {
        alert(err.message);
      }
    });
  }

  // C. Product Catalog & Placement Editor Modal
  const adminProductEditorModalBackdrop = document.getElementById('adminProductEditorModalBackdrop');
  const adminProductEditorForm = document.getElementById('adminProductEditorForm');
  const prodModalHeading = document.getElementById('prodModalHeading');
  const adminProdEditCategory = document.getElementById('adminProdEditCategory');
  const adminProdEditName = document.getElementById('adminProdEditName');
  const adminProdEditCompany = document.getElementById('adminProdEditCompany');
  const adminProdEditWebsite = document.getElementById('adminProdEditWebsite');
  const adminProdEditPrice = document.getElementById('adminProdEditPrice');
  const adminProdEditBid = document.getElementById('adminProdEditBid');
  const adminProdEditBadge = document.getElementById('adminProdEditBadge');
  const adminProdEditLogo = document.getElementById('adminProdEditLogo');
  const adminProdEditTagline = document.getElementById('adminProdEditTagline');
  const adminProdEditSpecs = document.getElementById('adminProdEditSpecs');
  const adminProdEditIsUpdate = document.getElementById('adminProdEditIsUpdate');
  const adminProdEditOriginalId = document.getElementById('adminProdEditOriginalId');
  const closeAdminProductEditorModalBtn = document.getElementById('closeAdminProductEditorModalBtn');
  const cancelAdminProductEditorBtn = document.getElementById('cancelAdminProductEditorBtn');
  const adminHeaderAddProdBtn = document.getElementById('adminHeaderAddProdBtn');
  const adminAddProductBtn = document.getElementById('adminAddProductBtn');

  function openAdminProductEditorModal(cSlug = null, prod = null) {
    if (!adminProductEditorModalBackdrop) return;

    if (adminProdEditCategory && appState.categories) {
      adminProdEditCategory.innerHTML = appState.categories
        .map((c) => `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.title)}</option>`)
        .join('');
    }

    if (prod) {
      prodModalHeading.textContent = `Edit Product: ${prod.name}`;
      adminProdEditIsUpdate.value = 'true';
      adminProdEditOriginalId.value = prod.id;
      if (adminProdEditCategory && cSlug) adminProdEditCategory.value = cSlug;
      adminProdEditName.value = prod.name || '';
      adminProdEditCompany.value = prod.companyName || prod.company || prod.name || '';
      adminProdEditWebsite.value = prod.website || '';
      adminProdEditPrice.value = prod.pricingTag || prod.startingPrice || 'Free trial';
      adminProdEditBid.value = prod.amountPaid || 0;
      adminProdEditBadge.value = prod.highlightTag || prod.highlight || prod.badge || 'Verified';
      adminProdEditLogo.value = prod.logoText || (prod.name || '').slice(0, 2).toUpperCase();
      adminProdEditTagline.value = prod.tagline || '';
      adminProdEditSpecs.value = Array.isArray(prod.specs) ? prod.specs.join('\n') : '';
    } else {
      prodModalHeading.textContent = 'Add Platform to Directory';
      adminProdEditIsUpdate.value = 'false';
      adminProdEditOriginalId.value = '';
      adminProductEditorForm.reset();
      if (adminProdEditCategory && cSlug) adminProdEditCategory.value = cSlug;
      adminProdEditBadge.value = 'Verified';
      adminProdEditBid.value = 0;
    }

    adminProductEditorModalBackdrop.classList.remove('hidden');
  }

  function closeAdminProductEditorModal() {
    if (adminProductEditorModalBackdrop) adminProductEditorModalBackdrop.classList.add('hidden');
  }

  if (closeAdminProductEditorModalBtn) closeAdminProductEditorModalBtn.addEventListener('click', closeAdminProductEditorModal);
  if (cancelAdminProductEditorBtn) cancelAdminProductEditorBtn.addEventListener('click', closeAdminProductEditorModal);
  if (adminHeaderAddProdBtn) adminHeaderAddProdBtn.addEventListener('click', () => openAdminProductEditorModal());
  if (adminAddProductBtn) adminAddProductBtn.addEventListener('click', () => openAdminProductEditorModal());

  if (adminProductEditorForm) {
    adminProductEditorForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const isUpdate = adminProdEditIsUpdate.value === 'true';
      const origId = adminProdEditOriginalId.value;
      const targetCatSlug = adminProdEditCategory.value;

      const specs = adminProdEditSpecs.value
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const pName = adminProdEditName.value.trim();
      const payload = {
        name: pName,
        company: adminProdEditCompany.value.trim() || pName,
        companyName: adminProdEditCompany.value.trim() || pName,
        website: adminProdEditWebsite.value.trim(),
        startingPrice: adminProdEditPrice.value.trim(),
        pricingTag: adminProdEditPrice.value.trim(),
        amountPaid: Number(adminProdEditBid.value) || 0,
        badge: adminProdEditBadge.value.trim() || 'Verified',
        highlightTag: adminProdEditBadge.value.trim() || 'Verified',
        logoText: adminProdEditLogo.value.trim() || pName.slice(0, 2).toUpperCase(),
        tagline: adminProdEditTagline.value.trim(),
        specs: specs.length > 0 ? specs : undefined
      };

      try {
        const url = isUpdate
          ? `/api/categories/${targetCatSlug}/products/${origId}`
          : `/api/admin/categories/${targetCatSlug}/products`;
        const method = isUpdate ? 'PUT' : 'POST';

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save product');

        if (data.state) appState = data.state;
        closeAdminProductEditorModal();
        renderAdminPanel();
        showToast(isUpdate ? `Product "${pName}" updated!` : `Added "${pName}" to directory!`);
      } catch (err) {
        alert(err.message);
      }
    });
  }

  function renderAdminTransactionsTable() {
    if (!adminTransactionsTableBody || !appState) return;
    const txs = appState.transactions || [];
    if (txs.length === 0) {
      adminTransactionsTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">No transactions recorded yet.</td></tr>`;
      return;
    }

    adminTransactionsTableBody.innerHTML = txs
      .map(
        (t) => `
      <tr>
        <td style="font-size:11.5px;color:var(--text-muted);">${escapeHtml(new Date(t.timestamp || Date.now()).toLocaleDateString())}</td>
        <td>
          <div style="font-weight:650;">${escapeHtml(t.buyerName || t.userName || 'Anonymous')}</div>
          <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(t.buyerEmail || t.userEmail || '')}</div>
        </td>
        <td><span style="font-size:11.5px;color:var(--text-secondary);">${escapeHtml(t.categorySlug || '—')}</span></td>
        <td><strong>${escapeHtml(t.productName || t.description || 'Listing Placement')}</strong></td>
        <td><span class="admin-pill-tag sponsored">${escapeHtml(t.type || 'rank_bid')}</span></td>
        <td><strong>$${(t.amount || 0).toLocaleString()}</strong></td>
        <td><span style="color:#059669;font-weight:600;">Completed</span></td>
      </tr>
    `
      )
      .join('');
  }

  async function renderAdminReviews() {
    if (!adminReviewsTableBody) return;
    try {
      const res = await fetch('/api/admin/reviews');
      const data = await res.json();
      const reviews = data.reviews || [];
      const pendingCount = data.pendingCount || 0;

      if (adminPendingReviewsBadge) {
        adminPendingReviewsBadge.textContent = String(pendingCount);
        adminPendingReviewsBadge.classList.toggle('hidden', pendingCount === 0);
      }

      const q = (adminReviewSearchInput?.value || '').toLowerCase().trim();
      const statusFilter = adminReviewStatusFilter?.value || 'all';

      const filtered = reviews.filter((r) => {
        if (statusFilter !== 'all' && r.status !== statusFilter) return false;
        if (!q) return true;
        return (
          (r.authorName || '').toLowerCase().includes(q) ||
          (r.productName || '').toLowerCase().includes(q) ||
          (r.categoryTitle || '').toLowerCase().includes(q) ||
          (r.text || '').toLowerCase().includes(q)
        );
      });

      if (filtered.length === 0) {
        adminReviewsTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">No reviews found matching filter.</td></tr>`;
        return;
      }

      adminReviewsTableBody.innerHTML = filtered
        .map((r) => {
          const statusBadge = r.status === 'approved'
            ? `<span style="display:inline-block;padding:2px 8px;border-radius:12px;background:#ECFDF5;color:#065F46;font-size:11px;font-weight:600;">Approved</span>`
            : r.status === 'rejected'
            ? `<span style="display:inline-block;padding:2px 8px;border-radius:12px;background:#FEF2F2;color:#991B1B;font-size:11px;font-weight:600;">Rejected</span>`
            : `<span style="display:inline-block;padding:2px 8px;border-radius:12px;background:#FFFBEB;color:#92400E;font-size:11px;font-weight:600;">Pending</span>`;

          const stars = '★'.repeat(r.rating || 5) + '☆'.repeat(5 - (r.rating || 5));

          return `
            <tr>
              <td style="white-space:nowrap;font-size:12px;color:var(--text-muted);">${escapeHtml(r.timeAgo || 'Recent')}</td>
              <td>
                <div style="font-weight:600;font-size:13px;color:var(--text-main);">${escapeHtml(r.productName || 'General')}</div>
                <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(r.categoryTitle || r.categorySlug)}</div>
              </td>
              <td>
                <div style="font-weight:600;font-size:12.5px;">${escapeHtml(r.authorName)}</div>
                <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(r.authorRole || r.authorEmail || '')}</div>
              </td>
              <td>
                <div style="color:#F59E0B;font-size:12px;">${stars}</div>
              </td>
              <td style="max-width:320px;">
                <div style="font-size:12px;line-height:1.4;color:var(--text-main);">${escapeHtml(r.text)}</div>
                ${r.pros && r.pros.length ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Pros: ${r.pros.map(escapeHtml).join(', ')}</div>` : ''}
              </td>
              <td>${statusBadge}</td>
              <td>
                <div class="mod-btn-group">
                  ${r.status !== 'approved' ? `<button type="button" class="mod-btn approve" data-mod-id="${escapeHtml(r.id)}" data-mod-action="approve">Approve</button>` : ''}
                  ${r.status !== 'rejected' ? `<button type="button" class="mod-btn reject" data-mod-id="${escapeHtml(r.id)}" data-mod-action="reject">Reject</button>` : ''}
                  <button type="button" class="mod-btn delete" data-mod-id="${escapeHtml(r.id)}" data-mod-action="delete">✕</button>
                </div>
              </td>
            </tr>
          `;
        })
        .join('');

      adminReviewsTableBody.querySelectorAll('[data-mod-id]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const revId = btn.getAttribute('data-mod-id');
          const action = btn.getAttribute('data-mod-action');
          try {
            const res = await fetch(`/api/admin/reviews/${revId}/moderate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action })
            });
            const modData = await res.json();
            if (!res.ok) {
              showToast(modData.error || 'Failed to moderate review');
              return;
            }
            appState = modData.state;
            showToast(`Review ${action}d successfully`);
            renderAdminReviews();
          } catch {
            showToast('Network error moderating review');
          }
        });
      });
    } catch (err) {
      console.error('Failed to fetch admin reviews:', err);
    }
  }

  if (adminReviewSearchInput) {
    adminReviewSearchInput.addEventListener('input', () => renderAdminReviews());
  }
  if (adminReviewStatusFilter) {
    adminReviewStatusFilter.addEventListener('change', () => renderAdminReviews());
  }

  // =========================================================================
  // ADMIN TAB 5: B2B BUYER RFP LEADS LEDGER
  // =========================================================================
  let adminLeadsCache = [];

  async function renderAdminLeads() {
    if (!adminLeadsTableBody) return;
    try {
      const res = await fetch('/api/admin/leads');
      const data = await res.json();
      adminLeadsCache = data.leads || [];

      if (adminLeadsCountBadge) {
        adminLeadsCountBadge.textContent = adminLeadsCache.length;
      }

      const q = (adminLeadSearchInput?.value || '').toLowerCase().trim();
      const statusFilter = adminLeadStatusFilter?.value || 'all';

      const filtered = adminLeadsCache.filter((lead) => {
        if (statusFilter !== 'all' && lead.status !== statusFilter) return false;
        if (!q) return true;
        return (
          (lead.buyerName || '').toLowerCase().includes(q) ||
          (lead.buyerEmail || '').toLowerCase().includes(q) ||
          (lead.companyName || '').toLowerCase().includes(q) ||
          (lead.categoryTitle || '').toLowerCase().includes(q) ||
          (lead.selectedPlatforms || []).join(' ').toLowerCase().includes(q)
        );
      });

      if (filtered.length === 0) {
        adminLeadsTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">No buyer leads found matching current filter.</td></tr>`;
        return;
      }

      adminLeadsTableBody.innerHTML = filtered.map((l) => `
        <tr>
          <td><span style="font-family:monospace;font-size:11px;color:var(--text-muted);">${escapeHtml(l.id)}</span></td>
          <td>
            <div style="font-weight:650;">${escapeHtml(l.buyerName)}</div>
            <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(l.buyerEmail)}</div>
          </td>
          <td>
            <div style="font-weight:600;">${escapeHtml(l.companyName)}</div>
            <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(l.teamSize)}</div>
          </td>
          <td>
            <span style="font-size:11.5px;color:var(--text-secondary);">${escapeHtml(l.categoryTitle || l.categorySlug)}</span>
          </td>
          <td>
            <div><strong>${escapeHtml(l.estimatedBudget)}</strong></div>
            <div style="font-size:10.5px;color:var(--text-muted);">${escapeHtml(l.timeline)}</div>
          </td>
          <td>
            <select class="admin-lead-status-select" data-lead-status-id="${escapeHtml(l.id)}" style="font-size:11px;padding:3px 6px;border-radius:4px;border:1px solid var(--border-color);background:var(--bg-main);color:var(--text-main);">
              <option value="new" ${l.status === 'new' ? 'selected' : ''}>New Lead</option>
              <option value="contacted" ${l.status === 'contacted' ? 'selected' : ''}>Contacted</option>
              <option value="closed" ${l.status === 'closed' ? 'selected' : ''}>Closed Deal</option>
            </select>
          </td>
          <td style="font-size:11px;color:var(--text-muted);white-space:nowrap;">
            ${new Date(l.createdAt).toLocaleDateString()}
          </td>
        </tr>
      `).join('');

      adminLeadsTableBody.querySelectorAll('[data-lead-status-id]').forEach((sel) => {
        sel.addEventListener('change', async () => {
          const lId = sel.getAttribute('data-lead-status-id');
          const newStatus = sel.value;
          try {
            const statusRes = await fetch(`/api/admin/leads/${lId}/status`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: newStatus })
            });
            if (statusRes.ok) {
              showToast(`Lead ${lId} marked as ${newStatus}`);
              renderAdminLeads();
            }
          } catch {
            showToast('Failed to update lead status');
          }
        });
      });
    } catch (err) {
      console.error('Failed to load admin leads:', err);
    }
  }

  if (adminLeadSearchInput) {
    adminLeadSearchInput.addEventListener('input', () => renderAdminLeads());
  }
  if (adminLeadStatusFilter) {
    adminLeadStatusFilter.addEventListener('change', () => renderAdminLeads());
  }
  if (adminExportLeadsCsvBtn) {
    adminExportLeadsCsvBtn.addEventListener('click', () => {
      if (adminLeadsCache.length === 0) {
        showToast('No leads available to export');
        return;
      }
      const headers = ['ID', 'Date', 'Buyer Name', 'Work Email', 'Company', 'Team Size', 'Category', 'Budget', 'Timeline', 'Selected Platforms', 'Status'];
      const csvRows = [headers.join(',')];
      adminLeadsCache.forEach((l) => {
        const row = [
          `"${l.id}"`,
          `"${new Date(l.createdAt).toISOString()}"`,
          `"${(l.buyerName || '').replace(/"/g, '""')}"`,
          `"${(l.buyerEmail || '').replace(/"/g, '""')}"`,
          `"${(l.companyName || '').replace(/"/g, '""')}"`,
          `"${(l.teamSize || '').replace(/"/g, '""')}"`,
          `"${(l.categoryTitle || '').replace(/"/g, '""')}"`,
          `"${(l.estimatedBudget || '').replace(/"/g, '""')}"`,
          `"${(l.timeline || '').replace(/"/g, '""')}"`,
          `"${(l.selectedPlatforms || []).join('; ').replace(/"/g, '""')}"`,
          `"${l.status || 'new'}"`
        ];
        csvRows.push(row.join(','));
      });
      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `top10-buyer-rfp-leads-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Exported buyer leads to CSV');
    });
  }

  // =========================================================================
  // COMPLETE ACCOUNT & PROFILE DRAWER / MODAL (#accountModalBackdrop)
  // =========================================================================
  let activeAccountTab = 'profile';

  function getSavedPlatforms() {
    return Array.from(savedProductIds || []);
  }

  function toggleBookmarkProduct(id) {
    if (savedProductIds.has(id)) {
      savedProductIds.delete(id);
    } else {
      savedProductIds.add(id);
    }
    persistSavedProducts();
  }

  function openAccountModal() {
    if (!accountModalBackdrop || !currentUser) return;

    if (accBannerName) accBannerName.textContent = currentUser.name || 'User';
    if (accBannerEmail) accBannerEmail.textContent = currentUser.email || '';
    if (accBannerCompany) accBannerCompany.textContent = currentUser.company || 'Reader';
    if (accBannerAvatar) {
      accBannerAvatar.textContent = (currentUser.avatarText || 'U').toUpperCase();
      accBannerAvatar.style.background = currentUser.avatarBg || '#111827';
    }

    if (accBannerRole) {
      accBannerRole.textContent = currentUser.role === 'admin'
        ? 'Platform Admin'
        : currentUser.role === 'company'
        ? 'Verified Founder'
        : 'Pro Reader';
      accBannerRole.className = `acc-role-pill ${currentUser.role || 'reader'}`;
    }

    if (accInputName) accInputName.value = currentUser.name || '';
    if (accInputEmail) accInputEmail.value = currentUser.email || '';
    if (accInputCompany) accInputCompany.value = currentUser.company || '';

    const saved = getSavedPlatforms();
    if (accBookmarksCount) accBookmarksCount.textContent = String(saved.length);

    renderAccountTabPanels();
    accountModalBackdrop.classList.remove('hidden');
  }

  if (closeAccountModalBtn) {
    closeAccountModalBtn.addEventListener('click', () => {
      accountModalBackdrop.classList.add('hidden');
    });
  }

  document.querySelectorAll('.account-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      activeAccountTab = tab.getAttribute('data-acc-tab');
      renderAccountTabPanels();
    });
  });

  function renderAccountTabPanels() {
    const panels = {
      profile: document.getElementById('accPanelProfile'),
      bookmarks: document.getElementById('accPanelBookmarks'),
      sponsorships: document.getElementById('accPanelSponsorships'),
      receipts: document.getElementById('accPanelReceipts')
    };

    Object.keys(panels).forEach((k) => {
      if (panels[k]) {
        panels[k].classList.toggle('hidden', k !== activeAccountTab);
      }
    });

    document.querySelectorAll('.account-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.getAttribute('data-acc-tab') === activeAccountTab);
    });

    if (activeAccountTab === 'bookmarks') renderAccountBookmarks();
    if (activeAccountTab === 'sponsorships') renderAccountSponsorships();
    if (activeAccountTab === 'receipts') renderAccountReceipts();
    renderAccountSwitchPills();
  }

  function renderAccountBookmarks() {
    if (!accBookmarksList || !appState) return;
    const saved = getSavedPlatforms();
    if (accBookmarksEmpty) accBookmarksEmpty.classList.toggle('hidden', saved.length > 0);

    const items = [];
    (appState.categories || []).forEach((c) => {
      [...(c.top10 || []), ...(c.pushedOut || [])].forEach((p) => {
        if (saved.includes(p.id)) items.push({ prod: p, cat: c });
      });
    });

    accBookmarksList.innerHTML = items
      .map(
        ({ prod, cat }) => `
      <div class="acc-item-card">
        <div class="acc-item-left">
          ${renderBrandLogo(prod, 28)}
          <div>
            <div class="acc-item-name">${escapeHtml(prod.name)} <span style="font-size:11px;color:var(--text-muted);font-weight:450;">in ${escapeHtml(cat.title)}</span></div>
            <div class="acc-item-sub">Rank #${prod.rank} · ${escapeHtml(prod.pricingTag || 'Transparent Pricing')}</div>
          </div>
        </div>
        <div class="acc-item-actions">
          <button type="button" class="admin-btn-action" data-acc-view-list="${escapeHtml(cat.slug)}">View Guide →</button>
          <button type="button" class="admin-btn-action admin-btn-danger" data-acc-remove-bm="${escapeHtml(prod.id)}">Remove</button>
        </div>
      </div>
    `
      )
      .join('');

    accBookmarksList.querySelectorAll('[data-acc-view-list]').forEach((btn) => {
      btn.addEventListener('click', () => {
        accountModalBackdrop.classList.add('hidden');
        navigateToCategory(btn.getAttribute('data-acc-view-list'));
      });
    });

    accBookmarksList.querySelectorAll('[data-acc-remove-bm]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-acc-remove-bm');
        toggleBookmarkProduct(id);
        const count = getSavedPlatforms().length;
        if (accBookmarksCount) accBookmarksCount.textContent = String(count);
        renderAccountBookmarks();
      });
    });
  }

  function renderAccountSponsorships() {
    if (!accSponsoredList || !appState) return;
    const email = (currentUser?.email || '').toLowerCase();
    const company = (currentUser?.company || '').toLowerCase();

    const owned = [];
    (appState.categories || []).forEach((c) => {
      [...(c.top10 || []), ...(c.pushedOut || [])].forEach((p) => {
        const isOwner = (p.ownerEmail && p.ownerEmail.toLowerCase() === email) ||
          (company && p.companyName.toLowerCase().includes(company)) ||
          currentUser.role === 'admin';
        if (isOwner && (p.amountPaid || 0) > 0) {
          owned.push({ prod: p, cat: c });
        }
      });
    });

    if (owned.length === 0) {
      accSponsoredList.innerHTML = `
        <div class="acc-empty-state">
          <div class="acc-empty-icon">🚀</div>
          <div class="acc-empty-title">No sponsored placements yet</div>
          <p class="acc-empty-text">Claim or boost a placement in any Top 10 list to feature your company at the top.</p>
        </div>
      `;
      return;
    }

    accSponsoredList.innerHTML = owned
      .map(
        ({ prod, cat }) => `
      <div class="acc-item-card">
        <div class="acc-item-left">
          ${renderBrandLogo(prod, 28)}
          <div>
            <div class="acc-item-name">${escapeHtml(prod.name)} <span class="admin-pill-tag sponsored" style="margin-left:6px;">Rank #${prod.rank}</span></div>
            <div class="acc-item-sub">${escapeHtml(cat.title)} · Current Placement: <strong>$${(prod.amountPaid || 0).toLocaleString()}</strong></div>
          </div>
        </div>
        <div class="acc-item-actions">
          <button type="button" class="btn-primary-compact" data-acc-boost-prod="${escapeHtml(prod.id)}" data-acc-cat="${escapeHtml(cat.slug)}">Boost Bid ↑</button>
        </div>
      </div>
    `
      )
      .join('');

    accSponsoredList.querySelectorAll('[data-acc-boost-prod]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const prodId = btn.getAttribute('data-acc-boost-prod');
        const cSlug = btn.getAttribute('data-acc-cat');
        accountModalBackdrop.classList.add('hidden');
        navigateToCategory(cSlug);
        openBidModal(1, 'existing', prodId);
      });
    });
  }

  function renderAccountReceipts() {
    if (!accReceiptsList || !appState) return;
    const txs = (appState.transactions || []).filter((t) => {
      if (currentUser.role === 'admin') return true;
      return (t.buyerEmail && t.buyerEmail.toLowerCase() === currentUser.email?.toLowerCase()) ||
        (t.userEmail && t.userEmail.toLowerCase() === currentUser.email?.toLowerCase());
    });

    if (txs.length === 0) {
      accReceiptsList.innerHTML = `
        <div class="acc-empty-state">
          <div class="acc-empty-icon">🧾</div>
          <div class="acc-empty-title">No transaction receipts</div>
          <p class="acc-empty-text">Receipts for directory launches ($99) and placement bids will appear here.</p>
        </div>
      `;
      return;
    }

    accReceiptsList.innerHTML = txs
      .map(
        (t) => `
      <div class="acc-item-card">
        <div>
          <div class="acc-item-name">${escapeHtml(t.productName || t.description || 'Listing Placement')}</div>
          <div class="acc-item-sub">${new Date(t.timestamp || Date.now()).toLocaleDateString()} · Inv #${t.id || 'INV-2026'} · <span style="color:#059669;font-weight:600;">Paid</span></div>
        </div>
        <div>
          <strong style="font-size:14px;">$${(t.amount || 0).toLocaleString()}</strong>
        </div>
      </div>
    `
      )
      .join('');
  }

  function renderAccountSwitchPills() {
    if (!accSwitchPills || !appState) return;
    const users = appState.users || [];
    accSwitchPills.innerHTML = users
      .map(
        (u) => `
      <button type="button" class="acc-switch-btn ${u.id === currentUser.id ? 'active' : ''}" data-acc-switch-id="${escapeHtml(u.id)}">
        ${escapeHtml(u.name)} (${escapeHtml(u.role)})
      </button>
    `
      )
      .join('');

    accSwitchPills.querySelectorAll('[data-acc-switch-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const uid = btn.getAttribute('data-acc-switch-id');
        const user = (appState.users || []).find((u) => u.id === uid);
        if (user) {
          currentUser = user;
          openAccountModal();
          renderAll();
          showToast(`Switched profile to ${user.name}`);
        }
      });
    });
  }

  if (accProfileForm) {
    accProfileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const res = await fetch('/api/user/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: currentUser.id,
            name: accInputName.value.trim(),
            email: accInputEmail.value.trim(),
            company: accInputCompany.value.trim()
          })
        });
        const data = await res.json();
        if (data.user) {
          currentUser = data.user;
          appState = data.state;
          openAccountModal();
          renderAll();
          showToast('Profile updated successfully');
        }
      } catch (err) {
        alert('Failed to update profile: ' + err.message);
      }
    });
  }

  // =========================================================================
  // SITE-WIDE 4-COLUMN FOOTER LISTENERS
  // =========================================================================
  document.querySelectorAll('.footer-link-btn[data-footer-slug]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slug = btn.getAttribute('data-footer-slug');
      navigateToCategory(slug);
    });
  });

  const footerLinkAllGuides = document.getElementById('footerLinkAllGuides');
  if (footerLinkAllGuides) footerLinkAllGuides.addEventListener('click', () => navigateToHome());

  const footerLinkBlog = document.getElementById('footerLinkBlog');
  if (footerLinkBlog) footerLinkBlog.addEventListener('click', () => navigateToBlog());

  const footerLinkAdmin = document.getElementById('footerLinkAdmin');
  if (footerLinkAdmin) footerLinkAdmin.addEventListener('click', () => navigateToAdmin());

  const footerLinkLaunchPaywall = document.getElementById('footerLinkLaunchPaywall');
  if (footerLinkLaunchPaywall) footerLinkLaunchPaywall.addEventListener('click', () => openCreateListPaywallModal());

  const footerThemeToggleBtn = document.getElementById('footerThemeToggleBtn');
  if (footerThemeToggleBtn) {
    footerThemeToggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('top10_theme', next);
      syncThemeIcons();
    });
  }

  const footerBackToTopBtn = document.getElementById('footerBackToTopBtn');
  if (footerBackToTopBtn) {
    footerBackToTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // =========================================================================
  // REAL-TIME SERVER-SENT EVENTS (SSE) & LIVE AUCTION NOTIFICATIONS
  // =========================================================================
  const navNotificationBtn = document.getElementById('navNotificationBtn');
  const topbarNotifDropdown = document.getElementById('topbarNotifDropdown');
  const topbarNotifBadge = document.getElementById('topbarNotifBadge');
  const notifDropdownList = document.getElementById('notifDropdownList');
  const clearNotifsBtn = document.getElementById('clearNotifsBtn');

  let appNotifications = [];
  let unreadNotifCount = 0;

  function addAppNotification(notif) {
    appNotifications.unshift({
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      type: notif.type || 'bid',
      title: notif.title,
      sub: notif.sub,
      time: notif.time || 'Just now',
      categorySlug: notif.categorySlug || null,
      productId: notif.productId || null
    });
    if (appNotifications.length > 30) appNotifications.pop();
    unreadNotifCount++;
    renderNotifications();
  }

  function renderNotifications() {
    if (topbarNotifBadge) {
      if (unreadNotifCount > 0) {
        topbarNotifBadge.textContent = String(unreadNotifCount);
        topbarNotifBadge.classList.remove('hidden');
      } else {
        topbarNotifBadge.classList.add('hidden');
      }
    }

    if (!notifDropdownList) return;
    if (appNotifications.length === 0) {
      notifDropdownList.innerHTML = `<div class="notif-empty-state">Listening to live auction stream...</div>`;
      return;
    }

    const icons = {
      bid: '⚡',
      retainer: '💎',
      review: '⭐',
      lead: '🎯',
      directory: '🚀'
    };

    notifDropdownList.innerHTML = appNotifications.map((n) => `
      <div class="notif-item" data-notif-slug="${escapeHtml(n.categorySlug || '')}">
        <div class="notif-item-icon ${escapeHtml(n.type)}">${icons[n.type] || '🔔'}</div>
        <div class="notif-item-content">
          <div class="notif-item-title">${escapeHtml(n.title)}</div>
          <div class="notif-item-sub">${escapeHtml(n.sub)}</div>
          <div class="notif-item-time">${escapeHtml(n.time)}</div>
        </div>
      </div>
    `).join('');

    notifDropdownList.querySelectorAll('.notif-item').forEach((item) => {
      item.addEventListener('click', () => {
        const slug = item.getAttribute('data-notif-slug');
        if (slug) {
          if (topbarNotifDropdown) topbarNotifDropdown.classList.add('hidden');
          navigateToCategory(slug);
        }
      });
    });
  }

  if (navNotificationBtn && topbarNotifDropdown) {
    navNotificationBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = topbarNotifDropdown.classList.toggle('hidden');
      if (!isHidden) {
        unreadNotifCount = 0;
        if (topbarNotifBadge) topbarNotifBadge.classList.add('hidden');
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.notif-menu-wrap')) {
        topbarNotifDropdown.classList.add('hidden');
      }
    });
  }

  if (clearNotifsBtn) {
    clearNotifsBtn.addEventListener('click', () => {
      appNotifications = [];
      unreadNotifCount = 0;
      renderNotifications();
    });
  }

  function highlightRankShift(productId) {
    if (!productId) return;
    setTimeout(() => {
      const card = document.getElementById(`prod-card-${productId}`);
      if (card) {
        card.classList.remove('rank-shift-pulse');
        void card.offsetWidth; // Force CSS reflow
        card.classList.add('rank-shift-pulse');
      }
    }, 100);
  }

  function initLiveAuctionStream() {
    if (typeof EventSource === 'undefined') return;

    const sse = new EventSource('/api/events/live-bids');

    sse.addEventListener('connected', () => {
      console.log('[SSE] Connected to real-time live auction stream');
    });

    sse.addEventListener('bid_placed', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.state) appState = data.state;

        addAppNotification({
          type: 'bid',
          title: `${data.productName} placed a bid of $${data.amountPaid}`,
          sub: `Moved to Rank #${data.newRank} in ${data.categoryTitle || data.categorySlug}`,
          categorySlug: data.categorySlug,
          productId: data.productId
        });

        if (currentView === 'list' && currentCategorySlug === data.categorySlug) {
          const cat = getActiveCategory();
          if (cat) renderSingleListPage(cat);
          highlightRankShift(data.productId);
          showToast(`⚡ Live Bid: ${data.productName} just bid $${data.amountPaid} & rose to Rank #${data.newRank}!`);
        } else if (currentView === 'home') {
          renderHomePage();
          showToast(`⚡ Live Bid: ${data.productName} bid $${data.amountPaid} in ${data.categoryTitle || data.categorySlug}!`);
        } else if (currentView === 'admin') {
          renderAdminPanel();
        }
      } catch (err) {
        console.error(err);
      }
    });

    sse.addEventListener('rank_boosted', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.state) appState = data.state;

        addAppNotification({
          type: 'bid',
          title: `${data.productName} boosted rank`,
          sub: `PayPal order paid $${data.amount}. Rank #${data.rankAchieved}`,
          categorySlug: data.categorySlug,
          productId: data.productId
        });

        if (currentView === 'list' && currentCategorySlug === data.categorySlug) {
          const cat = getActiveCategory();
          if (cat) renderSingleListPage(cat);
          highlightRankShift(data.productId);
          showToast(`⚡ Rank Boosted: ${data.productName} paid $${data.amount} for Rank #${data.rankAchieved}!`);
        } else if (currentView === 'admin') {
          renderAdminPanel();
        }
      } catch (err) {
        console.error(err);
      }
    });

    sse.addEventListener('retainer_locked', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.state) appState = data.state;

        addAppNotification({
          type: 'retainer',
          title: `${data.productName} locked retainer`,
          sub: `${data.tierName} ($${data.monthlyAmount}/mo MRR)`,
          categorySlug: data.categorySlug,
          productId: data.productId
        });

        if (currentView === 'list' && currentCategorySlug === data.categorySlug) {
          const cat = getActiveCategory();
          if (cat) renderSingleListPage(cat);
          highlightRankShift(data.productId);
          showToast(`💎 Retainer Locked: ${data.productName} locked ${data.tierName}!`);
        } else if (currentView === 'admin') {
          renderAdminPanel();
        }
      } catch (err) {
        console.error(err);
      }
    });

    sse.addEventListener('new_review', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.state) appState = data.state;

        addAppNotification({
          type: 'review',
          title: `New Review for ${data.productName}`,
          sub: `"${data.authorName}" submitted a ${data.stars || 5}-star review`,
          categorySlug: data.categorySlug
        });

        showToast(`⭐ New Review: "${data.authorName}" reviewed ${data.productName}`);
        if (currentView === 'admin') renderAdminPanel();
      } catch (err) {
        console.error(err);
      }
    });

    sse.addEventListener('review_moderated', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.state) {
          appState = data.state;
          if (currentView === 'list') {
            const cat = getActiveCategory();
            if (cat) renderContextStream(cat);
          } else if (currentView === 'admin') {
            renderAdminReviews();
          }
        }
      } catch (err) {
        console.error(err);
      }
    });

    sse.addEventListener('new_lead', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.state) appState = data.state;

        addAppNotification({
          type: 'lead',
          title: `Enterprise RFP from ${data.companyName}`,
          sub: `Requested custom pricing across ${data.selectedPlatforms?.length || 1} platforms`,
          categorySlug: data.categorySlug
        });

        showToast(`🎯 New Enterprise RFP captured from ${data.companyName}!`);
        if (currentView === 'admin') renderAdminPanel();
      } catch (err) {
        console.error(err);
      }
    });

    sse.addEventListener('new_directory', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.state) appState = data.state;

        addAppNotification({
          type: 'directory',
          title: `New Directory Launched`,
          sub: `${data.title} is now live with real-time bidding!`,
          categorySlug: data.categorySlug
        });

        showToast(`🚀 New Directory Launched: ${data.title}`);
        if (currentView === 'home') renderHomePage();
        if (currentView === 'admin') renderAdminPanel();
      } catch (err) {
        console.error(err);
      }
    });
  }

  // Initialize
  fetchState();
  initLiveAuctionStream();
})();
