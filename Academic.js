// ==UserScript==
// @name         Academic Info Displayer
// @namespace    http://tampermonkey.net/
// @version      3.5
// @description  Display academic paper information on publisher websites.
// @author       Your Name
// @match        *://*.nature.com/*
// @match        *://*.sciencemag.org/*
// @match        *://*.science.org/*
// @match        *://*.cell.com/*
// @match        *://*.onlinelibrary.wiley.com/*
// @match        *://opg.optica.org/*
// @match        *://*.springer.com/*
// @match        *://*.tandfonline.com/*
// @match        *://*.sagepub.com/*
// @match        *://*.plos.org/*
// @match        *://*.pnas.org/*
// @match        *://*.pubs.acs.org/*
// @match        *://*.oup.com/*
// @match        *://*.rsc.org/*
// @match        *://*.mdpi.com/*
// @match        *://*.frontiersin.org/*
// @match        *://*.nejm.org/*
// @match        *://*.bmj.com/*
// @match        *://*.jama.com/*
// @match        *://*.jamanetwork.com/*
// @match        *://*.ieee.org/*
// @match        *://*.acm.org/*
// @match        *://*.elsevier.com/*
// @match        *://*.sciencedirect.com/*
// @match        *://*.jstage.jst.go.jp/*
// @match        *://*.jci.org/*
// @match        *://*.bloodjournal.org/*
// @match        *://*.ahajournals.org/*
// @match        *://*.aacrjournals.org/*
// @match        *://*.embopress.org/*
// @match        *://*.journals.asm.org/*
// @match        *://*.annualreviews.org/*
// @match        *://*.royalsocietypublishing.org/*
// @match        *://*/*
// @resource     InterFont https://rsms.me/inter/inter.css
// @grant        GM_xmlhttpRequest
// @grant        GM_getResourceText
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.deleteValue
// @connect      api.crossref.org
// @connect      gist.githubusercontent.com
// @connect      rsms.me
// @connect      sci-hub.se
// @connect      sci-hub.cat
// @connect      sci-hub.ren
// ==/UserScript==

(function () {
    'use strict';

    // --- CONFIGURATION ---
    const JOURNAL_DATA_URL = 'https://gist.githubusercontent.com/Toutais998/492aef504e6e35eab7bdc5b95d275b53/raw/befd4711e89e06e7f281edfde380efeed7de0e39/gistfile1.txt';
    const SCIHUB_DOMAINS = ['sci-hub.se', 'sci-hub.ren', 'sci-hub.ru'];
    const MIN_IF_THRESHOLD = 2; // 最小影响因子阈值，低于此值的期刊将不会显示

    // --- NEW: Caching Configuration ---
    const CACHE_KEYS = {
        JOURNAL_DATA: 'academic_info_journal_data',
        SCIHUB_DOMAIN: 'academic_info_scihub_domain'
    };
    const CACHE_TTL = {
        [CACHE_KEYS.JOURNAL_DATA]: 7 * 24 * 60 * 60 * 1000, // 7 days
        [CACHE_KEYS.SCIHUB_DOMAIN]: 6 * 60 * 60 * 1000      // 6 hours
    };

    // 学术出版商配置信息，包含识别和处理特点
    const PUBLISHER_PATTERNS = [
        {
            name: "Nature Publishing Group",
            domains: ["nature.com"],
            subsidiaries: [
                "nature.com", "natureportfolio.com",
                "scientificamerican.com", "nature-portfolio.com"
            ],
            journals: [
                "Nature", "Nature Methods", "Nature Biotechnology", "Nature Cell Biology",
                "Nature Chemistry", "Nature Climate Change", "Nature Communications",
                "Nature Ecology & Evolution", "Nature Genetics", "Nature Geoscience",
                "Nature Human Behaviour", "Nature Immunology", "Nature Materials",
                "Nature Medicine", "Nature Microbiology", "Nature Nanotechnology",
                "Nature Neuroscience", "Nature Physics", "Nature Plants",
                "Nature Protocols", "Nature Reviews", "Nature Structural & Molecular Biology"
            ]
        },
        {
            name: "Elsevier",
            domains: ["elsevier.com", "sciencedirect.com"],
            subsidiaries: ["cell.com", "thelancet.com"],
            selectors: {
                doi: "#doi-link"
            }
        },
        {
            name: "Wiley",
            domains: ["wiley.com", "onlinelibrary.wiley.com"],
            subsidiaries: [],
            journals: []
        },
        {
            name: "Springer Nature",
            domains: ["springer.com", "springerlink.com"],
            subsidiaries: [],
            journals: []
        },
        {
            name: "AAAS",
            domains: ["sciencemag.org", "science.org"],
            subsidiaries: [],
            journals: ["Science", "Science Advances", "Science Immunology",
                "Science Robotics", "Science Signaling", "Science Translational Medicine"]
        }
    ];

    // --- STYLES FOR THE SHADOW DOM ---
    const styles = `
        :host {
            all: initial;
            font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }
        #academic-info-container {
            position: fixed;
            top: 150px;
            right: 20px;
            z-index: 2147483647;
        }
        #academic-info-toggle {
            width: 50px;
            height: 50px;
            background-color: #E53935;
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            font-family: serif;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            transition: transform 0.2s ease-in-out, background-color 0.3s ease;
        }
        #academic-info-container.high-if #academic-info-toggle {
            background-color: #4CAF50; /* 绿色表示高影响因子期刊 */
        }
        #academic-info-container.is-expanded #academic-info-toggle {
            transform: scale(1.1);
        }
        #academic-info-panel {
            position: absolute;
            right: 0;
            top: 65px;
            width: 480px;
            opacity: 0;
            pointer-events: none;
            transform: translateY(-10px);
            transition: all 0.2s ease-out;
            background-color: #fff;
            border: 1px solid #ddd;
            border-radius: 12px;
            box-shadow: 0 5px 25px rgba(0,0,0,0.12);
            font-size: 14px;
            color: #333;
            max-height: 80vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }
        #academic-info-container.is-expanded #academic-info-panel {
            opacity: 1;
            pointer-events: auto;
            transform: translateY(0);
        }
        .info-table {
            padding: 15px;
            overflow-y: auto;
            flex: 1;
            max-height: calc(80vh - 45px);
        }
        .title-header {
            font-size: 16px;
            font-weight: 600;
            padding: 12px 15px;
            margin: 0;
            background-color: #f7f7f7;
            border-bottom: 1px solid #ddd;
            border-radius: 12px 12px 0 0;
            position: sticky;
            top: 0;
            z-index: 1;
        }
        .info-row, .multi-col-row {
            display: flex;
            margin-bottom: 10px;
            align-items: flex-start;
        }
        .label {
            flex-shrink: 0;
            width: 75px;
            font-weight: 500;
            color: white;
            background-color: #2c3e50; /* Dark Slate */
            padding: 5px;
            border-radius: 6px;
            text-align: center;
            margin-right: 12px;
        }
        .value {
            flex-grow: 1;
            align-self: center;
            line-height: 1.5;
            word-break: break-word;
            display: flex;
            align-items: center;
        }
        .value.author-list {
            display: block; /* Override flex for normal text flow */
            align-self: flex-start;
        }
        .multi-col-row {
            justify-content: space-between;
        }
        .col-item {
            display: flex;
            align-items: center;
            width: 49%;
        }
        .value a {
            color: #2980b9;
            text-decoration: none;
            font-weight: 600;
        }
        .value a:hover {
            text-decoration: underline;
        }
        .copy-btn, .action-btn {
            background: #f5f7fa;
            border: 1px solid #dfe4ea;
            border-radius: 6px;
            padding: 4px 10px;
            margin-left: 8px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #474747;
        }
        .copy-btn:hover, .action-btn:hover {
            background: #dfe4ea;
            transform: translateY(-1px);
        }
        .action-row {
            display: flex;
            justify-content: space-between;
            padding-bottom: 10px;
            border-bottom: 1px solid #f1f2f6;
            margin-bottom: 12px;
        }
        .action-btn .icon {
            margin-right: 5px;
        }
        .if-badge, .jcr-badge, .rank-badge {
            padding: 3px 8px;
            border-radius: 6px;
            color: white;
            font-weight: 600;
            margin: 0 2px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .if-high { background: linear-gradient(135deg, #2ecc71, #27ae60); } /* 绿色渐变 - 高IF */
        .if-medium-high { background: linear-gradient(135deg, #3498db, #2980b9); } /* 蓝色渐变 - 中高IF */
        .if-medium { background: linear-gradient(135deg, #f1c40f, #f39c12); } /* 橙色渐变 - 中IF */
        .jcr-q1 { background: linear-gradient(135deg, #2ecc71, #27ae60); } /* Q1 - 绿色 */
        .jcr-q2 { background: linear-gradient(135deg, #3498db, #2980b9); } /* Q2 - 蓝色 */
        .jcr-q3 { background: linear-gradient(135deg, #f1c40f, #f39c12); } /* Q3 - 黄色 */
        .jcr-q4 { background: linear-gradient(135deg, #e74c3c, #c0392b); } /* Q4 - 红色 */
        .rank-badge { background: linear-gradient(135deg, #9b59b6, #8e44ad); } /* 紫色渐变 - 排名 */
        .orcid-icon {
            display: inline-block;
            width: 16px;
            height: 16px;
            background-color: #a6ce39;
            color: white;
            border-radius: 50%;
            text-align: center;
            font-size: 10px;
            line-height: 16px;
            font-weight: bold;
            text-decoration: none;
            vertical-align: middle;
            margin-left: 5px;
        }
        .settings-icon {
            position: absolute;
            top: 12px;
            right: 12px;
            width: 20px;
            height: 20px;
            opacity: 0.6;
            cursor: pointer;
            transition: opacity 0.2s;
        }
        .settings-icon:hover {
            opacity: 1;
        }
        .tooltip {
            position: relative;
            display: inline-block;
        }
        .tooltip .tooltip-text {
            visibility: hidden;
            width: 120px;
            background-color: rgba(51, 51, 51, 0.9);
            color: #fff;
            text-align: center;
            border-radius: 6px;
            padding: 5px;
            position: absolute;
            z-index: 1;
            bottom: 125%;
            left: 50%;
            margin-left: -60px;
            opacity: 0;
            transition: opacity 0.3s;
            font-size: 12px;
            pointer-events: none;
        }
        .tooltip:hover .tooltip-text {
            visibility: visible;
            opacity: 1;
        }
        .animation-pulse {
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }
        .alert {
            padding: 8px 12px;
            margin-bottom: 10px;
            border-radius: 6px;
            background-color: #f8f9fa;
            border-left: 4px solid #ccc;
            font-size: 13px;
        }
        .alert-info {
            background-color: #e3f2fd;
            border-left-color: #2196f3;
            color: #0d47a1;
        }
        .alert-success {
            background-color: #e8f5e9;
            border-left-color: #4caf50;
            color: #1b5e20;
        }
    `;

    // --- NEW: Caching Helper Functions ---
    async function getCached(key) {
        try {
            const cached = await GM.getValue(key);
            if (!cached) return null;

            const { timestamp, data } = JSON.parse(cached);
            if (Date.now() - timestamp > CACHE_TTL[key]) {
                await GM.deleteValue(key);
                console.log(`Academic Info Displayer: Cache expired for ${key}`);
                return null;
            }
            return data;
        } catch (e) {
            console.error(`Academic Info Displayer: Error getting cache for ${key}`, e);
            return null;
        }
    }

    async function setCached(key, data) {
        try {
            const value = JSON.stringify({ timestamp: Date.now(), data });
            await GM.setValue(key, value);
        } catch (e) {
            console.error(`Academic Info Displayer: Error setting cache for ${key}`, e);
        }
    }


    function fetchJournalData(url) {
        return new Promise(async (resolve, reject) => {
            const cachedData = await getCached(CACHE_KEYS.JOURNAL_DATA);
            if (cachedData) {
                console.log("Academic Info Displayer: Loaded journal data from cache.");
                return resolve(cachedData);
            }

            if (!url || url.includes('PASTE_YOUR_GIST_RAW_URL_HERE')) {
                return resolve({});
            }
            GM_xmlhttpRequest({
                method: "GET", url: url,
                onload: async function (response) {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const data = JSON.parse(response.responseText);
                            await setCached(CACHE_KEYS.JOURNAL_DATA, data);
                            console.log("Academic Info Displayer: Fetched and cached new journal data.");
                            resolve(data);
                        } catch (e) { reject(e); }
                    } else { reject(`Failed to fetch journal data. Status: ${response.status}`); }
                },
                onerror: function (error) { reject(error); }
            });
        });
    }

    function fetchMetadataFromCrossref(doi) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET", url: `https://api.crossref.org/works/${doi}`,
                onload: function (response) {
                    if (response.status >= 200 && response.status < 300) {
                        const msg = JSON.parse(response.responseText).message;
                        if (!msg) { reject("CrossRef format error"); return; }
                        const authors = msg.author ? msg.author.map(author => ({
                            name: `${author.given ? author.given + ' ' : ''}${author.family || ''}`,
                            orcidLink: author.ORCID ? `https://orcid.org/${(author.ORCID.match(/([^\/]+)$/) || [])[1] || author.ORCID}` : null,
                            isCorresponding: false
                        })) : [];
                        const pubDate = msg.issued || msg.published || msg['published-online'];
                        const year = pubDate && pubDate['date-parts'] ? pubDate['date-parts'][0][0].toString() : '';
                        resolve({
                            title: (msg.title || [])[0] || '',
                            journal: (msg['container-title'] || [])[0].replace(/&amp;/g, '&') || '',
                            year: year,
                            authors: authors
                        });
                    } else { reject(`CrossRef request failed: ${response.status}`); }
                },
                onerror: function (error) { reject(error); }
            });
        });
    }

    function formatAuthors(authors) {
        if (!authors || authors.length === 0) return 'Not found';
        let correspondingFound = false;
        const processedAuthors = authors.map(author => {
            let displayName = author.name;
            if (author.isCorresponding) { displayName += ' 📧'; correspondingFound = true; }
            if (author.orcidLink) { displayName += ` <a href="${author.orcidLink}" target="_blank" title="View ORCID profile" class="orcid-icon">iD</a>`; }
            return displayName;
        });
        if (!correspondingFound && processedAuthors.length > 0) {
            processedAuthors[processedAuthors.length - 1] += ' 📧';
        }
        if (processedAuthors.length > 3) {
            const firstTwo = processedAuthors.slice(0, 2).join(', ');
            const lastOne = processedAuthors[processedAuthors.length - 1];
            return `${firstTwo}, ..., ${lastOne}`;
        }
        return processedAuthors.join(', ');
    }

    // --- NEW: Helper function to find a working Sci-Hub domain ---
    async function findWorkingSciHubDomain() {
        const cachedDomain = await getCached(CACHE_KEYS.SCIHUB_DOMAIN);
        if (cachedDomain) {
            console.log(`Academic Info Displayer: Using cached Sci-Hub domain: ${cachedDomain}`);
            return cachedDomain;
        }

        console.log("Academic Info Displayer: Checking Sci-Hub domains...");
        for (const domain of SCIHUB_DOMAINS) {
            try {
                await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: "HEAD",
                        url: `https://${domain}/`,
                        timeout: 3000, // 3 seconds timeout
                        onload: (response) => (response.status >= 200 && response.status < 400) ? resolve() : reject(),
                        onerror: () => reject(),
                        ontimeout: () => reject(),
                    });
                });
                console.log(`Academic Info Displayer: Found working Sci-Hub domain: ${domain}`);
                await setCached(CACHE_KEYS.SCIHUB_DOMAIN, domain);
                return domain; // Return the first one that resolves
            } catch (error) {
                console.log(`Academic Info Displayer: Domain ${domain} failed.`);
            }
        }
        console.log("Academic Info Displayer: No working Sci-Hub domains found.");
        return null; // Return null if none work
    }

    // --- NEW: 智能检测页面是否包含学术论文 ---
    function detectAcademicPage() {
        // 检查关键meta标签
        const hasDOIMeta = !!document.querySelector('meta[name="citation_doi"], meta[name="dc.Identifier"], meta[property="og:doi"]');
        const hasJournalMeta = !!document.querySelector('meta[name="citation_journal_title"], meta[name="prism.publicationName"]');
        const hasTitleMeta = !!document.querySelector('meta[name="citation_title"], meta[property="og:title"]');
        const hasAuthorMeta = !!document.querySelector('meta[name="citation_author"], meta[name="dc.Creator"]');

        // 检查URL中是否包含典型的学术文章路径模式
        const urlPatterns = [
            /\/doi\//, /\/article\//, /\/full\//, /\/abs\//, /\/abstract\//,
            /\/content\//, /\/publication\//, /\/view\//, /\/pii\//,
            /\/science\/article\//, /\/document\//, /\/doi\/full\//
        ];
        const urlHasPattern = urlPatterns.some(pattern => pattern.test(window.location.pathname));

        // 检查页面文本是否包含DOI标记
        const bodyText = document.body.textContent || '';
        const hasDOIText = /doi\.org\/10\.\d{4,}\//.test(bodyText) ||
            /DOI:\s*10\.\d{4,}\//.test(bodyText);

        // 检查页面结构中是否有常见的学术文章元素
        const hasAbstract = !!document.querySelector(
            '[id*="abstract"], [class*="abstract"], ' +
            '[id*="summary"], [class*="summary"], ' +
            'section[role="region"][aria-labelledby*="abstract"]'
        );

        // 检查是否包含引用部分
        const hasReferences = !!document.querySelector(
            '[id*="reference"], [class*="reference"], ' +
            '[id*="bibliography"], [class*="bibliography"], ' +
            'section[role="doc-bibliography"]'
        );

        // 检查出版商特定的结构
        const currentHost = window.location.hostname;
        const matchedPublisher = PUBLISHER_PATTERNS.find(p =>
            p.domains.some(domain => currentHost.includes(domain)) ||
            p.subsidiaries.some(sub => currentHost.includes(sub))
        );

        if (matchedPublisher) {
            console.log(`Academic Info Displayer: 检测到出版商 ${matchedPublisher.name}`);
            // 如果识别到特定出版商，可以进行额外的特定检查
        }

        // 通过多个因素综合判断
        return (
            hasDOIMeta ||
            (hasJournalMeta && hasTitleMeta) ||
            (urlHasPattern && (hasAuthorMeta || hasDOIText || hasAbstract)) ||
            (hasAbstract && hasReferences) ||
            !!extractDOI() // 如果能够提取到DOI，肯定是论文页面
        );
    }

    // --- NEW: 多模式DOI提取器 ---
    function extractDOI() {
        try {
            // 方法1: 从meta标签提取
            const metaSelectors = [
                'meta[name="citation_doi"]',
                'meta[name="dc.Identifier"]',
                'meta[property="og:doi"]',
                'meta[name="doi"]',
                'meta[name="prism.doi"]'
            ];

            for (const selector of metaSelectors) {
                const meta = document.querySelector(selector);
                if (meta && meta.content && meta.content.includes('10.')) {
                    return meta.content.match(/(10\.\d{4,9}\/[-._;()\/:A-Z0-9]+)/i)?.[1];
                }
            }

            // 方法2: 从URL提取
            const urlMatch = window.location.pathname.match(/\/(10\.\d{4,9}\/[-._;()\/:A-Z0-9]+)/i) ||
                window.location.pathname.match(/doi\/(?:full\/|abs\/)?(10\.\d{4,9}\/[-._;()\/:A-Z0-9]+)/i);
            if (urlMatch && urlMatch[1]) return urlMatch[1];

            // 方法3: 从页面链接提取
            const doiLinks = [
                ...Array.from(document.querySelectorAll('a[href*="doi.org"]')),
                ...Array.from(document.querySelectorAll('a[href*="doi:"]')),
                ...Array.from(document.querySelectorAll('a[href*="10."]'))
            ];

            for (const link of doiLinks) {
                const match = link.href.match(/(?:doi\.org\/|doi:)(10\.\d{4,9}\/[-._;()\/:A-Z0-9]+)/i);
                if (match && match[1]) return match[1];
            }

            // 方法4: 从页面文本提取
            const doiPatterns = [
                /DOI:\s*(10\.\d{4,9}\/[-._;()\/:A-Z0-9]+)/i,
                /doi\.org\/(10\.\d{4,9}\/[-._;()\/:A-Z0-9]+)/i,
                /[Dd][Oo][Ii]:\s*(10\.\d{4,9}\/[-._;()\/:A-Z0-9]+)/
            ];

            for (const pattern of doiPatterns) {
                const textMatches = document.body.textContent.match(pattern);
                if (textMatches && textMatches[1]) return textMatches[1];
            }

            // 方法5: 检查出版商特定的DOM元素
            const currentHost = window.location.hostname;
            const matchedPublisher = PUBLISHER_PATTERNS.find(p =>
                p.domains.some(domain => currentHost.includes(domain)) ||
                p.subsidiaries.some(sub => currentHost.includes(sub))
            );

            if (matchedPublisher && matchedPublisher.selectors?.doi) {
                const doiElement = document.querySelector(matchedPublisher.selectors.doi);
                if (doiElement) {
                    const doiText = doiElement.textContent || doiElement.innerText;
                    if (doiText) {
                        const match = doiText.match(/(10\.\d{4,9}\/[-._;()\/:A-Z0-9]+)/i);
                        if (match && match[1]) return match[1];
                    }
                }
            }

            return null;
        } catch (e) {
            console.error("Academic Info Displayer: DOI提取出错", e);
            return null;
        }
    }

    // --- NEW: 增强的期刊信息获取 ---
    async function getEnhancedJournalInfo(journalName, journalData) {
        if (!journalName) return null;

        // 1. 首先尝试直接匹配
        let journalInfo = journalData[journalName.toUpperCase()] || journalData[journalName];
        if (journalInfo) return journalInfo;

        // 2. 尝试通过模糊匹配找到最接近的期刊
        const normalizedName = journalName.toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/[^\w\s]/g, '');

        for (const key in journalData) {
            const currentNormalized = key.toLowerCase()
                .replace(/\s+/g, ' ')
                .replace(/[^\w\s]/g, '');

            // 简单的包含关系检查
            if (normalizedName.includes(currentNormalized) || currentNormalized.includes(normalizedName)) {
                return journalData[key];
            }

            // 处理期刊缩写与全名的匹配问题
            if (journalData[key].abbr &&
                journalName.toLowerCase().includes(journalData[key].abbr.toLowerCase())) {
                return journalData[key];
            }
        }

        // 3. 识别期刊所属的出版集团
        for (const publisher of PUBLISHER_PATTERNS) {
            if (publisher.journals.some(j => j.toLowerCase() === normalizedName)) {
                // 如果在已知的高IF期刊列表中找到
                return {
                    name: journalName,
                    if: "预设高IF期刊",
                    category: `${publisher.name}|预设高IF`
                };
            }
        }

        return null;
    }

    // --- NEW: Citation Generator ---
    function generateCitation(article, format) {
        const { title, authors, year, journal, doi } = article;
        const authorList = authors.map(a => a.name);

        const authorStr = (() => {
            if (authorList.length === 0) return 'N/A';
            if (authorList.length === 1) return authorList[0];
            if (authorList.length > 2) return `${authorList[0]} et al.`;
            return `${authorList[0]} and ${authorList[1]}`;
        })();

        const cleanTitle = title.split('|')[0].trim();

        switch (format) {
            case 'apa':
                const authorApa = authorList.map(name => {
                    const parts = name.split(' ');
                    const family = parts.pop();
                    const given = parts.map(p => `${p[0]}.`).join('');
                    return `${family}, ${given}`;
                }).join(', ');
                return `${authorApa} (${year}). ${cleanTitle}. *${journal}*. https://doi.org/${doi}`;
            case 'bibtex':
                const firstAuthorLastName = authors.length > 0 ? authors[0].name.split(' ').pop() : 'misc';
                const bibKey = `${firstAuthorLastName}${year}${cleanTitle.split(' ')[0] || ''}`.replace(/[^a-zA-Z0-9]/g, '');
                return `@article{${bibKey},\n  title = {${cleanTitle}},\n  author = {${authorList.join(' and ')}},\n  journal = {${journal}},\n  year = {${year}},\n  doi = {${doi}}\n}`;
            default: // Simple copy
                return `${authorStr}, "${cleanTitle}," ${journal}, (${year}).`;
        }
    }

    // --- NEW: UI Rendering Function ---
    function renderPanelContent(article, journalInfo) {
        const addRow = (label, value, valueClass = '') => value ? `<div class="info-row"><div class="label">${label}</div><div class="value ${valueClass}">${value}</div></div>` : '';
        const addMultiColRow = (items) => {
            let content = '<div class="multi-col-row">';
            items.forEach(item => { if (item.value) { content += `<div class="col-item"><div class="label">${item.label}</div><div class="value">${item.value}</div></div>`; } });
            return content + '</div>';
        };

        let doiHTML = article.doi ? `${article.doi}<button id="copy-doi-btn" class="copy-btn" title="Copy DOI">📋</button>` : 'Not Found';
        const cleanTitle = article.title.split('|')[0].trim();
        const displayTitle = article.journal ? `${cleanTitle} | ${article.journal}` : cleanTitle;

        let panelContent = `<div class="title-header">${displayTitle}<svg id="settings-btn" class="settings-icon" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.69-1.62-0.92L14.4,2.23C14.34,2,14.09,1.86,13.83,1.86 h-3.8c-0.26,0-0.5,0.14-0.57,0.37L9.08,4.71c-0.59,0.23-1.12,0.54-1.62,0.92L5.07,4.67c-0.22-0.07-0.47,0-0.59,0.22L2.56,8.22 c-0.11,0.2-0.06,0.47,0.12,0.61l2.03,1.58C4.68,10.71,4.66,11.02,4.66,11.34c0,0.32,0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.69,1.62,0.92l0.37,2.48 c0.06,0.23,0.31,0.37,0.57,0.37h3.8c0.26,0,0.5-0.14,0.57-0.37l0.37-2.48c0.59-0.23,1.12-0.54,1.62-0.92l2.39,0.96 c0.22,0.07,0.47,0,0.59-0.22l1.92-3.32c0.11-0.2,0.06-0.47-0.12-0.61L19.14,12.94z M11.94,15.34c-2.21,0-4-1.79-4-4 c0-2.21,1.79-4,4-4s4,1.79,4,4C15.94,13.55,14.15,15.34,11.94,15.34z"></path></svg></div><div class="info-table">`;

        // Actions Row
        panelContent += `<div class="info-row">
            <div class="label">Actions</div>
            <div class="value">
                <button id="cite-btn" class="action-btn">Cite</button>
                <button id="bibtex-btn" class="action-btn">BibTeX</button>
                <button id="scihub-btn" class="action-btn" style="margin-left: auto;">Sci-Hub</button>
            </div>
        </div>`;

        panelContent += addRow('DOI', doiHTML);

        if (journalInfo) {
            panelContent += addMultiColRow([{ label: 'Journal', value: article.journal }, { label: 'Abbr.', value: journalInfo.abbr }]);
            panelContent += addMultiColRow([{ label: 'ISSN', value: journalInfo.issn }, { label: 'Year', value: article.year || 'N/A' }]);
        } else {
            panelContent += addRow('Journal', article.journal);
            panelContent += addRow('Year', article.year || 'N/A');
        }

        if (journalInfo) {
            const ifValue = parseFloat(journalInfo.if);
            let impactHTML = '';
            if (!isNaN(ifValue)) {
                let ifClass = 'if-medium';
                if (ifValue >= 20) ifClass = 'if-high';
                else if (ifValue > 15) ifClass = 'if-medium-high';
                impactHTML += `<span class="if-badge ${ifClass}">${journalInfo.if}</span>`;
            }
            if (journalInfo.if5y) { impactHTML += ` 5Y IF: <span class="if-badge">${journalInfo.if5y}</span>`; }
            if (impactHTML) { panelContent += addRow('Impact', impactHTML); }

            if (journalInfo.category) {
                const parts = journalInfo.category.split('|');
                const jcrQuartile = (parts[1] || '').trim().toUpperCase();
                let jcrClass = '';
                switch (jcrQuartile) {
                    case 'Q1': jcrClass = 'jcr-q1'; break;
                    case 'Q2': jcrClass = 'jcr-q2'; break;
                    case 'Q3': jcrClass = 'jcr-q3'; break;
                    case 'Q4': jcrClass = 'jcr-q4'; break;
                }
                const rankHTML = parts[2] ? `<span class="rank-badge">${parts[2]}</span>` : '';
                panelContent += addMultiColRow([
                    { label: 'JCR', value: jcrQuartile ? `<span class="jcr-badge ${jcrClass}">${jcrQuartile}</span>` : '' },
                    { label: 'Rank', value: rankHTML }
                ]);
                panelContent += addRow('Category', parts[0]);
            }
        } else {
            panelContent += `<div class="alert alert-info">Journal data not in local DB.</div>`;
        }

        panelContent += addRow('Authors', formatAuthors(article.authors), 'author-list');
        panelContent += '</div>';
        return panelContent;
    }


    async function main() {
        // 首先检查是否为学术页面
        if (!detectAcademicPage()) {
            console.log("Academic Info Displayer: 当前页面不是学术论文页面，不会显示工具");
            return;
        }

        const sciHubDomainPromise = findWorkingSciHubDomain();
        let journalData = {};
        try {
            journalData = await fetchJournalData(JOURNAL_DATA_URL);
        } catch (error) {
            console.error("Academic Info Displayer: Could not load external journal data.", error);
        }
        setTimeout(() => displayAcademicInfo(journalData, sciHubDomainPromise), 500);
    }

    async function displayAcademicInfo(journalData, sciHubDomainPromise) {
        const getMetaContent = (name) => document.querySelector(`meta[name='${name}']`)?.content || '';
        let article = { doi: '', title: '', journal: '', year: '', authors: [] };
        let apiSucceeded = false;

        // 使用增强的DOI提取方法
        article.doi = extractDOI();

        if (article.doi) {
            try {
                article = { ...article, ...(await fetchMetadataFromCrossref(article.doi)) };
                apiSucceeded = true;
            } catch (error) {
                console.error("Academic Info Displayer: CrossRef API call failed.", error);
            }
        }

        if (!apiSucceeded) {
            article.title = getMetaContent('citation_title') ||
                getMetaContent('dc.Title') ||
                document.querySelector('h1')?.textContent ||
                document.title;

            article.journal = getMetaContent('citation_journal_title') ||
                getMetaContent('prism.publicationName') ||
                getMetaContent('dc.Source');

            const pubDate = getMetaContent('citation_publication_date') ||
                getMetaContent('prism.publicationDate');
            article.year = pubDate ? new Date(pubDate).getFullYear().toString() : '';

            // 尝试多种作者提取方法
            const authorMetas = document.querySelectorAll("meta[name='citation_author'], meta[name='dc.Creator']");
            if (authorMetas.length > 0) {
                article.authors = Array.from(authorMetas).map(meta => ({ name: meta.content }));
            } else {
                // 尝试从页面中提取作者信息
                const authorElements = document.querySelectorAll(
                    '[class*="author"], [id*="author"], [data-test*="author"]'
                );
                if (authorElements.length > 0) {
                    article.authors = Array.from(authorElements)
                        .filter(el => el.textContent.length < 50) // 过滤掉太长的文本，可能是作者部分而非单个作者
                        .map(el => ({ name: el.textContent.trim() }));
                }
            }
        }

        if (!article.journal) {
            console.log("Academic Info Displayer: Could not determine journal title. Aborting.");
            return;
        }

        // 使用增强的期刊信息获取
        const journalInfo = await getEnhancedJournalInfo(article.journal, journalData);

        const ifValue = journalInfo ? parseFloat(journalInfo.if) : 0;
        if (journalInfo && !isNaN(ifValue) && ifValue < MIN_IF_THRESHOLD && ifValue !== 0) {
            console.log(`Academic Info Displayer: Journal IF ${ifValue} is below threshold ${MIN_IF_THRESHOLD}. Aborting.`);
            return;
        }

        const host = document.createElement('div');
        const shadowRoot = host.attachShadow({ mode: 'open' });
        document.body.appendChild(host);

        const fontCss = GM_getResourceText("InterFont");
        const styleSheet = document.createElement('style');
        styleSheet.textContent = fontCss + styles;
        shadowRoot.appendChild(styleSheet);

        const container = document.createElement('div');
        container.id = 'academic-info-container';
        if (ifValue >= 20) {
            container.classList.add('high-if');
        }

        let isPinned = false;
        container.addEventListener('mouseenter', () => container.classList.add('is-expanded'));
        container.addEventListener('mouseleave', () => { if (!isPinned) container.classList.remove('is-expanded'); });

        const toggle = document.createElement('div');
        toggle.id = 'academic-info-toggle';
        toggle.textContent = 'i';
        toggle.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); isPinned = !isPinned; if (isPinned) container.classList.add('is-expanded'); });

        const panel = document.createElement('div');
        panel.id = 'academic-info-panel';
        panel.innerHTML = renderPanelContent(article, journalInfo);

        container.appendChild(toggle);
        container.appendChild(panel);
        shadowRoot.appendChild(container);

        // --- Event Listeners ---
        const copyBtn = shadowRoot.getElementById('copy-doi-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(article.doi).then(() => {
                    copyBtn.textContent = '✅'; setTimeout(() => { copyBtn.textContent = '📋'; }, 1500);
                });
            });
        }

        const setupCitationButton = (btnId, format) => {
            const btn = shadowRoot.getElementById(btnId);
            if (btn) {
                btn.addEventListener('click', () => {
                    const citation = generateCitation(article, format);
                    navigator.clipboard.writeText(citation).then(() => {
                        const originalText = btn.textContent;
                        btn.textContent = 'Copied!';
                        setTimeout(() => { btn.textContent = originalText; }, 1500);
                    });
                });
            }
        };

        setupCitationButton('cite-btn', 'apa');
        setupCitationButton('bibtex-btn', 'bibtex');


        const sciHubBtn = shadowRoot.getElementById('scihub-btn');
        if (sciHubBtn) {
            sciHubBtn.addEventListener('click', async () => {
                sciHubBtn.textContent = 'Finding...';
                sciHubBtn.disabled = true;
                const domain = await sciHubDomainPromise;
                if (domain && article.doi) {
                    window.open(`https://${domain}/${article.doi}`, '_blank');
                    sciHubBtn.textContent = 'Sci-Hub';
                    sciHubBtn.disabled = false;
                } else {
                    sciHubBtn.textContent = 'No Hub Found';
                    setTimeout(() => {
                        sciHubBtn.textContent = 'Sci-Hub';
                        sciHubBtn.disabled = false;
                    }, 2000);
                }
            });
        }

        const settingsBtn = shadowRoot.getElementById('settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                // Future: open settings modal
                alert('Settings panel coming soon!');
            });
        }
    }


    // 页面加载完成后执行，使用适当的延迟确保meta标签已加载
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(main, 1000);
    } else {
        window.addEventListener('DOMContentLoaded', () => setTimeout(main, 1000));
    }
})();
