

import {themes as prismThemes} from 'prism-react-renderer';



/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'AgroSense Café',
  tagline: 'IoT monitoring and traceability for Colombian coffee',
  favicon: 'img/favicon.ico',


  future: {
    v4: true, 
  },


  url: 'https://gen-lang-client-0936632479.web.app/',

  baseUrl: '/',

  organizationName: 'Pbyte5',
  projectName: 'AgroSense-Documents',

  onBrokenLinks: 'throw',


  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          editUrl: 'https://github.com/Pbyte5/AgroSense-Documents/tree/main/',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'AgroSense Café',
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'tutorialSidebar',
            position: 'left',
            label: 'Project',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              {
                label: 'Project overview',
                to: '/docs/intro',
              },
            ],
          },
          {
            title: 'Repositories',
            items: [
              {
                label: 'Documentation source',
                href: 'https://github.com/Pbyte5/AgroSense-Documents',
              },
              {
                label: 'Application code',
                href: 'https://github.com/Pbyte5/AgroSense-Caf-IoT-Monitoring-and-Traceability-Framework',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} AgroSense Café.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

export default config;
