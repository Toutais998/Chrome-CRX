// ==UserScript==
// @name         Academic Info Displayer
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  Display academic paper information on publisher websites.
// @author       Your Name
// @match        *://*.nature.com/*
// @match        *://*.sciencemag.org/*
// @match        *://*.science.org/*
// @match        *://*.cell.com/*
// @match        *://*.onlinelibrary.wiley.com/*
// @match        *://opg.optica.org/*
// @resource     InterFont https://rsms.me/inter/inter.css
// @grant        GM_xmlhttpRequest
// @grant        GM_getResourceText
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
            transition: transform 0.2s ease-in-out;
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
            border-radius: 8px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
            font-size: 14px;
            color: #333;
        }
        #academic-info-container.is-expanded #academic-info-panel {
            opacity: 1;
            pointer-events: auto;
            transform: translateY(0);
        }
        .info-table {
            padding: 15px;
            max-height: 450px;
            overflow-y: auto;
        }
        .title-header {
            font-size: 16px;
            font-weight: 600;
            padding: 12px 15px;
            margin: 0;
            background-color: #f7f7f7;
            border-bottom: 1px solid #ddd;
            border-radius: 8px 8px 0 0;
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
            border-radius: 4px;
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
            background: #ecf0f1;
            border: 1px solid #bdc3c7;
            border-radius: 4px;
            padding: 2px 6px;
            margin-left: 8px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            transition: all 0.2s ease;
        }
        .copy-btn:hover, .action-btn:hover {
            background: #bdc3c7;
        }
        .if-badge, .jcr-badge {
            padding: 3px 8px;
            border-radius: 4px;
            color: white;
            font-weight: 600;
            margin: 0 2px;
            background-color: #7f8c8d; /* Default gray for all badges */
        }
        .if-high { background-color: #27ae60; } /* Green */
        .if-medium-high { background-color: #2980b9; } /* Blue */
        .if-medium { background-color: #f39c12; } /* Orange */
        .jcr-badge { background-color: #27ae60; } /* Green */
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
    `;

    function fetchJournalData(url) {
        return new Promise((resolve, reject) => {
            if (!url || url === 'PASTE_YOUR_GIST_RAW_URL_HERE') {
                return resolve({});
            }
            GM_xmlhttpRequest({
                method: "GET", url: url,
                onload: function (response) {
                    if (response.status >= 200 && response.status < 300) {
                        try { resolve(JSON.parse(response.responseText)); } catch (e) { reject(e); }
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
                return domain; // Return the first one that resolves
            } catch (error) {
                console.log(`Academic Info Displayer: Domain ${domain} failed.`);
            }
        }
        console.log("Academic Info Displayer: No working Sci-Hub domains found.");
        return null; // Return null if none work
    }


    async function main() {
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

        article.doi = getMetaContent('citation_doi') || (window.location.pathname.match(/doi\/(?:full\/)?(10\.\d{4,9}\/[-._;()\/:A-Z0-9]+)/i) || [])[1];

        if (article.doi) {
            try {
                article = { ...article, ...(await fetchMetadataFromCrossref(article.doi)) };
                apiSucceeded = true;
            } catch (error) {
                console.error("Academic Info Displayer: CrossRef API call failed.", error);
            }
        }

        if (!apiSucceeded) {
            article.title = getMetaContent('citation_title') || document.title;
            article.journal = getMetaContent('citation_journal_title');
            const pubDate = getMetaContent('citation_publication_date');
            article.year = pubDate ? new Date(pubDate).getFullYear().toString() : '';
            // Simplified fallback for authors
            const authorMetas = document.querySelectorAll("meta[name='citation_author']");
            if (authorMetas.length > 0) {
                article.authors = Array.from(authorMetas).map(meta => ({ name: meta.content }));
            }
        }

        if (!article.journal) { return; }

        const host = document.createElement('div');
        const shadowRoot = host.attachShadow({ mode: 'open' });
        document.body.appendChild(host);

        const fontCss = GM_getResourceText("InterFont");
        const styleSheet = document.createElement('style');
        styleSheet.textContent = fontCss + styles;
        shadowRoot.appendChild(styleSheet);

        const container = document.createElement('div');
        container.id = 'academic-info-container';
        let isPinned = false;
        container.addEventListener('mouseenter', () => container.classList.add('is-expanded'));
        container.addEventListener('mouseleave', () => { if (!isPinned) container.classList.remove('is-expanded'); });

        const toggle = document.createElement('div');
        toggle.id = 'academic-info-toggle';
        toggle.textContent = 'i';
        toggle.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); isPinned = !isPinned; if (isPinned) container.classList.add('is-expanded'); });

        const panel = document.createElement('div');
        panel.id = 'academic-info-panel';

        const journalInfo = article.journal ? journalData[article.journal.toUpperCase()] || journalData[article.journal] : null;
        const authorsText = formatAuthors(article.authors);
        const cleanTitle = article.title.split('|')[0].trim();
        const displayTitle = article.journal ? `${cleanTitle} | ${article.journal}` : cleanTitle;

        const addRow = (label, value, valueClass = '') => value ? `<div class="info-row"><div class="label">${label}</div><div class="value ${valueClass}">${value}</div></div>` : '';
        const addMultiColRow = (items) => {
            let content = '<div class="multi-col-row">';
            items.forEach(item => { if (item.value) { content += `<div class="col-item"><div class="label">${item.label}</div><div class="value">${item.value}</div></div>`; } });
            return content + '</div>';
        };

        let doiHTML = article.doi;
        if (article.doi) { doiHTML += `<button id="copy-doi-btn" class="copy-btn" title="Copy DOI">📋</button>`; }

        let panelContent = `<div class="title-header">${displayTitle}</div><div class="info-table">`;

        // --- ADD NEW ACTIONS ROW ---
        panelContent += `<div class="info-row">
            <div class="label">Actions</div>
            <div class="value">
                <button id="cite-btn" class="action-btn">Cite</button>
                <button id="scihub-btn" class="action-btn">Sci-Hub</button>
            </div>
        </div>`;

        panelContent += addRow('DOI', doiHTML);
        panelContent += addRow('Type', 'Journal Article');

        if (journalInfo) {
            panelContent += addMultiColRow([{ label: 'Journal', value: article.journal }, { label: 'Abbr.', value: journalInfo.abbr }]);
            panelContent += addMultiColRow([{ label: 'ISSN', value: journalInfo.issn }, { label: 'Year', value: article.year || 'N/A' }]);
        } else {
            panelContent += addRow('Journal', article.journal); panelContent += addRow('Year', article.year || 'N/A');
        }

        if (journalInfo) {
            const ifValue = parseFloat(journalInfo.if);
            let impactHTML = '';
            if (!isNaN(ifValue)) {
                let ifClass = 'if-medium';
                if (ifValue >= 20) ifClass = 'if-high';
                else if (ifValue > 15) ifClass = 'if-medium-high';
                impactHTML += `IF: <span class="if-badge ${ifClass}">${journalInfo.if}</span>`;
            }
            if (journalInfo.if5y) { impactHTML += ` 5Y IF: <span class="if-badge">${journalInfo.if5y}</span>`; }
            if (impactHTML) { panelContent += addRow('Impact', impactHTML); }

            if (journalInfo.category) {
                const parts = journalInfo.category.split('|');
                panelContent += addMultiColRow([{ label: 'JCR', value: parts[1] ? `<span class="jcr-badge">${parts[1]}</span>` : '' }, { label: 'Rank', value: parts[2] }]);
                panelContent += addRow('Category', parts[0]);
            }
        } else { panelContent += addRow('Data', 'Not in local DB'); }

        panelContent += addRow('Author', authorsText, 'author-list');
        panelContent += '</div>';

        panel.innerHTML = panelContent;
        container.appendChild(toggle);
        container.appendChild(panel);
        shadowRoot.appendChild(container);

        const copyBtn = shadowRoot.getElementById('copy-doi-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(article.doi).then(() => {
                    copyBtn.textContent = '✅'; setTimeout(() => { copyBtn.textContent = '📋'; }, 1500);
                });
            });
        }

        const citeBtn = shadowRoot.getElementById('cite-btn');
        if (citeBtn) {
            citeBtn.addEventListener('click', () => {
                const firstAuthor = article.authors.length > 0 ? article.authors[0].name : '';
                const authorStr = article.authors.length > 1 ? `${firstAuthor} et al.` : firstAuthor;
                const citation = `${authorStr}, '${cleanTitle}' (${article.year}), ${article.journal}`;
                navigator.clipboard.writeText(citation).then(() => {
                    citeBtn.textContent = 'Copied!';
                    setTimeout(() => { citeBtn.textContent = 'Cite'; }, 1500);
                });
            });
        }

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
    }

    window.addEventListener('load', main);
})(); 