/**
 * Test Data Factory for Scry
 *
 * Provides consistent, realistic test data generation following industry best practices.
 * Supports various data types including form data, user data, and WordPress-specific content.
 *
 * @author Scry
 */

/**
 * Base class for all test data factories
 */
class BaseFactory {
  constructor() {
    this.sequence = 0;
  }

  /**
   * Generate a unique sequence number
   */
  nextSequence() {
    return ++this.sequence;
  }

  /**
   * Generate a timestamp-based unique ID
   */
  generateUniqueId(prefix = 'test') {
    const timestamp = Date.now();
    const sequence = this.nextSequence();
    return `${prefix}_${timestamp}_${sequence}`;
  }

  /**
   * Pick a random item from an array
   */
  randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  /**
   * Generate a random number between min and max (inclusive)
   */
  randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Generate a random boolean
   */
  randomBoolean() {
    return Math.random() < 0.5;
  }
}

/**
 * Factory for generating personal/user data
 */
class PersonDataFactory extends BaseFactory {
  constructor() {
    super();

    this.firstNames = [
      'Alex',
      'Jordan',
      'Casey',
      'Morgan',
      'Taylor',
      'Riley',
      'Avery',
      'Quinn',
      'Emma',
      'Liam',
      'Olivia',
      'Noah',
      'Sophia',
      'Mason',
      'Isabella',
      'William',
      'Ava',
      'James',
      'Charlotte',
      'Benjamin',
      'Mia',
      'Lucas',
      'Amelia',
      'Henry',
    ];

    this.lastNames = [
      'Smith',
      'Johnson',
      'Williams',
      'Brown',
      'Jones',
      'Garcia',
      'Miller',
      'Davis',
      'Rodriguez',
      'Martinez',
      'Hernandez',
      'Lopez',
      'Gonzalez',
      'Wilson',
      'Anderson',
      'Thomas',
      'Taylor',
      'Moore',
      'Jackson',
      'Martin',
      'Lee',
      'Thompson',
      'White',
    ];

    this.domains = [
      'example.com',
      'test.org',
      'demo.net',
      'sample.co',
      'testing.io',
      'automation.dev',
      'qa.test',
      'playwright.test',
    ];

    this.phoneAreaCodes = ['555', '123', '987', '456', '789', '234', '876', '345'];
  }

  /**
   * Generate a random first name
   */
  firstName() {
    return this.randomChoice(this.firstNames);
  }

  /**
   * Generate a random last name
   */
  lastName() {
    return this.randomChoice(this.lastNames);
  }

  /**
   * Generate a full name
   */
  fullName() {
    return `${this.firstName()} ${this.lastName()}`;
  }

  /**
   * Generate a test email address
   * @param {Object} options - Options for email generation
   */
  email(options = {}) {
    const {
      domain = this.randomChoice(this.domains),
      prefix = null,
      includeNumbers = true,
    } = options;

    const baseEmail =
      prefix || `${this.firstName().toLowerCase()}.${this.lastName().toLowerCase()}`;
    const numbers = includeNumbers ? this.randomBetween(1, 999) : '';

    return `${baseEmail}${numbers}@${domain}`;
  }

  /**
   * Generate a test phone number
   * @param {string} format - Phone format ('us', 'international', 'simple')
   */
  phoneNumber(format = 'us') {
    const areaCode = this.randomChoice(this.phoneAreaCodes);
    const exchange = this.randomBetween(200, 999);
    const number = this.randomBetween(1000, 9999);

    switch (format) {
      case 'us':
        return `(${areaCode}) ${exchange}-${number}`;
      case 'international':
        return `+1-${areaCode}-${exchange}-${number}`;
      case 'simple':
        return `${areaCode}${exchange}${number}`;
      default:
        return `${areaCode}-${exchange}-${number}`;
    }
  }

  /**
   * Generate a complete person object
   */
  person(options = {}) {
    const firstName = this.firstName();
    const lastName = this.lastName();

    return {
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
      email: this.email({
        ...options,
        prefix: `${firstName.toLowerCase()}.${lastName.toLowerCase()}`,
      }),
      phone: this.phoneNumber(options.phoneFormat),
      id: this.generateUniqueId('person'),
      ...options.additionalFields,
    };
  }
}

/**
 * Factory for generating form data
 */
class FormDataFactory extends BaseFactory {
  constructor() {
    super();

    this.inquiryTypes = [
      'General Inquiry',
      'Support Request',
      'Sales Question',
      'Technical Issue',
      'Feature Request',
      'Bug Report',
      'Partnership Opportunity',
      'Consultation',
    ];

    this.subjects = [
      'Request for Information',
      'Product Demo Request',
      'Technical Support Needed',
      'Pricing Question',
      'Custom Solution Inquiry',
      'Website Feedback',
      'Service Integration',
      'Partnership Discussion',
    ];

    this.messagePrefixes = [
      'I am interested in learning more about',
      'Could you please provide information regarding',
      'I would like to discuss',
      'Our company is looking for',
      'We need assistance with',
      'I have a question about',
      'Could you help us with',
      'We are evaluating solutions for',
    ];

    this.messageBodySamples = [
      'your services and how they might benefit our organization.',
      'the implementation process and timeline for your solution.',
      'pricing options and what is included in each package.',
      'integration capabilities with our existing systems.',
      'the technical requirements and setup process.',
      'ongoing support and maintenance options available.',
      'customization possibilities for our specific needs.',
      'case studies or examples of similar implementations.',
    ];

    this.companyTypes = [
      'Software Development',
      'E-commerce',
      'Healthcare',
      'Education',
      'Finance',
      'Marketing Agency',
      'Non-profit',
      'Government',
      'Manufacturing',
      'Retail',
    ];

    this.companyNames = [
      'TechCorp Solutions',
      'Digital Innovations LLC',
      'Global Systems Inc',
      'NextGen Technologies',
      'Smart Solutions Group',
      'Advanced Analytics Co',
      'Future Forward Inc',
      'Dynamic Systems LLC',
      'Integrated Solutions Group',
    ];
  }

  /**
   * Generate a realistic contact form message
   */
  contactMessage(options = {}) {
    const {
      length = 'medium', // 'short', 'medium', 'long'
      includeDetails = true,
    } = options;

    const prefix = this.randomChoice(this.messagePrefixes);
    const body = this.randomChoice(this.messageBodySamples);

    let message = `${prefix} ${body}`;

    if (includeDetails && length !== 'short') {
      const details = [
        'Please let me know the best time to schedule a call.',
        'I would appreciate any documentation you can share.',
        'Looking forward to hearing from you soon.',
        'Thank you for your time and consideration.',
        'We are hoping to implement a solution within the next few months.',
      ];

      message += ` ${this.randomChoice(details)}`;
    }

    if (length === 'long') {
      const additionalInfo = [
        'Our team has been researching various options and your solution seems like a great fit.',
        'We have a budget allocated for this project and are ready to move forward quickly.',
        'I can provide more details about our requirements during our initial discussion.',
      ];

      message += ` ${this.randomChoice(additionalInfo)}`;
    }

    return message;
  }

  /**
   * Generate a subject line for contact forms
   */
  subject() {
    return this.randomChoice(this.subjects);
  }

  /**
   * Generate company information
   */
  company() {
    return {
      name: this.randomChoice(this.companyNames),
      type: this.randomChoice(this.companyTypes),
      size: this.randomChoice([
        'Small (1-10)',
        'Medium (11-50)',
        'Large (51-200)',
        'Enterprise (200+)',
      ]),
      website: `https://www.${this.randomChoice(this.companyNames).toLowerCase().replace(/\s+/g, '')}.com`,
    };
  }

  /**
   * Generate complete form data for contact forms
   */
  contactForm(options = {}) {
    const person = new PersonDataFactory().person(options);
    const company = this.company();

    return {
      // Basic contact fields
      name: person.fullName,
      firstName: person.firstName,
      lastName: person.lastName,
      email: person.email,
      phone: person.phone,

      // Message fields
      subject: this.subject(),
      message: this.contactMessage(options),
      inquiry: this.randomChoice(this.inquiryTypes),

      // Optional company fields
      company: company.name,
      companyType: company.type,
      website: company.website,

      // Technical fields
      id: this.generateUniqueId('form'),
      timestamp: new Date().toISOString(),

      // Test metadata
      isTestData: true,
      source: 'playwright-automation',
    };
  }

  /**
   * Generate newsletter signup data
   */
  newsletterSignup(options = {}) {
    const person = new PersonDataFactory().person(options);

    return {
      email: person.email,
      firstName: person.firstName,
      lastName: person.lastName,
      interests: this.randomChoice([
        'Technology',
        'Business',
        'Design',
        'Marketing',
        'Development',
      ]),
      frequency: this.randomChoice(['Weekly', 'Monthly', 'Quarterly']),
      id: this.generateUniqueId('newsletter'),
      timestamp: new Date().toISOString(),
      isTestData: true,
    };
  }

  /**
   * Generate search query data
   */
  searchQuery(options = {}) {
    const { category = 'general' } = options;

    const queries = {
      general: ['services', 'about us', 'contact', 'pricing', 'support', 'help'],
      ecommerce: ['products', 'shop', 'cart', 'checkout', 'shipping', 'returns'],
      blog: ['latest news', 'articles', 'blog posts', 'tutorials', 'guides'],
      technical: ['documentation', 'API', 'integration', 'setup', 'configuration'],
    };

    return {
      query: this.randomChoice(queries[category] || queries.general),
      category,
      timestamp: new Date().toISOString(),
      isTestData: true,
    };
  }
}

/**
 * Factory for WordPress-specific test data
 */
class WordPressDataFactory extends BaseFactory {
  constructor() {
    super();

    this.postTitles = [
      'Welcome to Our Website',
      'Getting Started Guide',
      'Latest Updates and Features',
      'Tips for Success',
      'Common Questions Answered',
      'Best Practices Guide',
      'Important Announcement',
      'New Features Released',
      'How-To Tutorial',
    ];

    this.categories = [
      'Announcements',
      'Tutorials',
      'News',
      'Updates',
      'Guides',
      'Tips',
      'Features',
      'Support',
      'Documentation',
      'Resources',
    ];

    this.tags = [
      'important',
      'featured',
      'new',
      'updated',
      'guide',
      'tutorial',
      'tips',
      'help',
      'documentation',
      'announcement',
    ];
  }

  /**
   * Generate WordPress post data
   */
  post(options = {}) {
    return {
      title: this.randomChoice(this.postTitles),
      slug: this.postTitles[0].toLowerCase().replace(/\s+/g, '-'),
      content: 'This is test content generated by the automation suite.',
      excerpt: 'Test excerpt for automated testing purposes.',
      category: this.randomChoice(this.categories),
      tags: this.randomChoice(this.tags),
      status: options.status || 'publish',
      author: new PersonDataFactory().fullName(),
      id: this.generateUniqueId('post'),
      isTestData: true,
    };
  }

  /**
   * Generate WordPress comment data
   */
  comment(options = {}) {
    const person = new PersonDataFactory().person();

    return {
      author: person.fullName,
      email: person.email,
      website: options.includeWebsite ? `https://www.${person.firstName.toLowerCase()}.com` : '',
      content: 'This is a test comment generated by the automation suite for testing purposes.',
      postId: options.postId || this.randomBetween(1, 100),
      id: this.generateUniqueId('comment'),
      isTestData: true,
    };
  }

  /**
   * Generate WordPress user data
   */
  user(options = {}) {
    const person = new PersonDataFactory().person();
    const username = `${person.firstName.toLowerCase()}${this.randomBetween(1, 999)}`;

    return {
      username,
      email: person.email,
      firstName: person.firstName,
      lastName: person.lastName,
      displayName: person.fullName,
      role: options.role || 'subscriber',
      password: 'TestPassword123!', // Fixed test password
      bio: 'Test user created by automation suite',
      id: this.generateUniqueId('user'),
      isTestData: true,
    };
  }
}

/**
 * Factory for test URLs and navigation data
 */
class NavigationDataFactory extends BaseFactory {
  constructor() {
    super();

    this.commonPages = [
      '/',
      '/about',
      '/contact',
      '/services',
      '/products',
      '/blog',
      '/support',
      '/faq',
      '/privacy',
      '/terms',
      '/sitemap',
    ];

    this.ecommercePages = [
      '/shop',
      '/cart',
      '/checkout',
      '/account',
      '/orders',
      '/wishlist',
      '/products/category',
      '/products/featured',
      '/sale',
    ];

    this.blogPages = [
      '/blog',
      '/blog/category',
      '/blog/tag',
      '/blog/archive',
      '/blog/author',
      '/blog/search',
      '/blog/latest',
    ];
  }

  /**
   * Get common website pages for testing
   */
  getCommonPages(includeEcommerce = false, includeBlog = true) {
    let pages = [...this.commonPages];

    if (includeEcommerce) {
      pages = pages.concat(this.ecommercePages);
    }

    if (includeBlog) {
      pages = pages.concat(this.blogPages);
    }

    return pages;
  }

  /**
   * Generate test navigation data
   */
  navigationTest(options = {}) {
    const { maxPages = 10, includeEcommerce = false, includeBlog = true } = options;
    const allPages = this.getCommonPages(includeEcommerce, includeBlog);

    // Randomly select pages up to maxPages
    const selectedPages = [];
    const availablePages = [...allPages];

    for (let i = 0; i < Math.min(maxPages, availablePages.length); i++) {
      const randomIndex = Math.floor(Math.random() * availablePages.length);
      selectedPages.push(availablePages.splice(randomIndex, 1)[0]);
    }

    return {
      pages: selectedPages,
      startPage: '/',
      maxDepth: options.maxDepth || 3,
      includeExternal: options.includeExternal || false,
      id: this.generateUniqueId('nav-test'),
      isTestData: true,
    };
  }
}

/**
 * Main factory class that combines all factories
 */
class TestDataFactory {
  constructor() {
    this.person = new PersonDataFactory();
    this.form = new FormDataFactory();
    this.wordpress = new WordPressDataFactory();
    this.navigation = new NavigationDataFactory();
  }

  /**
   * Generate a complete test scenario with all necessary data
   */
  testScenario(type = 'contact', options = {}) {
    const scenarios = {
      contact: () => ({
        user: this.person.person(),
        formData: this.form.contactForm(options),
        navigation: this.navigation.navigationTest({ maxPages: 5 }),
      }),

      ecommerce: () => ({
        user: this.person.person(),
        formData: this.form.contactForm(options),
        navigation: this.navigation.navigationTest({
          maxPages: 8,
          includeEcommerce: true,
        }),
      }),

      blog: () => ({
        user: this.person.person(),
        post: this.wordpress.post(),
        comment: this.wordpress.comment(),
        navigation: this.navigation.navigationTest({
          maxPages: 6,
          includeBlog: true,
        }),
      }),

      newsletter: () => ({
        user: this.person.person(),
        signupData: this.form.newsletterSignup(options),
        navigation: this.navigation.navigationTest({ maxPages: 3 }),
      }),
    };

    const scenario = scenarios[type] || scenarios.contact;

    return {
      type,
      id: `scenario_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      ...scenario(),
      isTestData: true,
    };
  }

  /**
   * Generate minimal test data for quick tests
   */
  quickTest(type = 'basic') {
    switch (type) {
      case 'contact':
        return {
          name: 'Test User',
          email: 'test@example.com',
          message: 'This is a test message for automation testing.',
        };

      case 'search':
        return {
          query: 'services',
        };

      case 'newsletter':
        return {
          email: 'newsletter.test@example.com',
        };

      default:
        return {
          name: 'Test User',
          email: 'test@example.com',
        };
    }
  }

  /**
   * Validate test data structure
   */
  validateTestData(data, requiredFields = []) {
    const missing = requiredFields.filter((field) => {
      return !Object.prototype.hasOwnProperty.call(data, field) || !data[field];
    });

    return {
      isValid: missing.length === 0,
      missingFields: missing,
      data,
    };
  }
}

// Export factories for use in tests
module.exports = {
  TestDataFactory,
  PersonDataFactory,
  FormDataFactory,
  WordPressDataFactory,
  NavigationDataFactory,

  // Convenience functions for quick access
  createTestData: (type, options) => new TestDataFactory().testScenario(type, options),
  createQuickData: (type) => new TestDataFactory().quickTest(type),
  createPerson: (options) => new PersonDataFactory().person(options),
  createFormData: (options) => new FormDataFactory().contactForm(options),
};
