(function () {
    'use strict';

    // --- CONFIGURATION ---
    const JOURNAL_DATA_URL = 'https://gist.githubusercontent.com/Toutais998/492aef504e6e35eab7bdc5b95d275b53/raw/befd4711e89e06e7f281edfde380efeed7de0e39/gistfile1.txt';

    const PUBLISHER_PATTERNS = [
        {
            name: "American Chemical Society",
            domains: ["acs.org"],
            subsidiaries: [],
            journals: ["JACS", "JPCA", "JPCL", "JPCC", "JPLE", "JPLO", "JPS", "JPCB", "JPCF", "JPCLC", "JPCLD", "JPCLF", "JPCLG", "JPCLH", "JPCLI", "JPCLL", "JPCLM", "JPCLN", "JPCLP", "JPCLQ", "JPCLR", "JPCLS", "JPCLT", "JPCLU", "JPCLV", "JPCLW", "JPCLX", "JPCLY", "JPCLZ"]
        },
        {
            name: "American Physical Society",
            domains: ["aps.org"],
            subsidiaries: [],
            journals: ["Phys. Rev. A", "Phys. Rev. B", "Phys. Rev. C", "Phys. Rev. D", "Phys. Rev. E", "Phys. Rev. Lett.", "Phys. Rev. Materials", "Phys. Rev. X", "Phys. Rev. Accel. Beams", "Phys. Rev. Applied", "Phys. Rev. Fluids", "Phys. Rev. Research", "Phys. Rev. Special Topics - Accelerators and Beams", "Phys. Rev. Special Topics - Applied Physics", "Phys. Rev. Special Topics - Materials Science", "Phys. Rev. Special Topics - Physics Education Research"]
        },
        {
            name: "American Society for Cell Biology",
            domains: ["ascb.org"],
            subsidiaries: [],
            journals: ["Molecular Biology of the Cell", "Molecular Cell", "Cell", "Developmental Cell", "Trends in Cell Biology", "Current Biology", "Cell Stem Cell", "Cell Reports", "Cell Systems", "Cell Host & Microbe"]
        },
        {
            name: "American Society for Biochemistry and Molecular Biology",
            domains: ["asbmb.org"],
            subsidiaries: [],
            journals: ["Journal of Biological Chemistry", "Molecular Biology of the Cell", "Molecular Cell", "Cell", "Developmental Cell", "Trends in Cell Biology", "Current Biology", "Cell Stem Cell", "Cell Reports", "Cell Systems", "Cell Host & Microbe"]
        },
        {
            name: "Optica Publishing Group",
            domains: ["opg.optica.org", "optica.org"],
            subsidiaries: [],
            journals: []
        }
    ];

    // --- STYLES FOR THE SHADOW DOM ---
    const styles = `
        #academic-info-container {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
            transition: transform 0.2s ease-in-out;
        }
        #academic-info-toggle {
            background-color: #fff;
            border: none;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            font-size: 20px;
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
            background-color: #fff;
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            display: flex;
            flex-direction: column;
        }
        #academic-info-container.is-expanded #academic-info-panel {
            opacity: 1;
            visibility: visible;
            transform: translateY(0);
        }
        .info-table {
            padding: 15px;
        }
        .value {
            flex-grow: 1;
            align-self: center;
            line-height: 1.5;
            word-break: break-word;
            display: flex;
            align-items: center;
            flex-wrap: wrap; /* Allow items to wrap to the next line */
            gap: 5px; /* Add space between items */
        }
        .value.author-list {
            display: block; /* Override flex for normal text flow */
        }
    `;

    async function main() {
        // The academic page check has been removed to improve compatibility.
        // The script will now run on all matched pages and gracefully exit if no
        // journal information can be found.

        const sciHubDomainPromise = findWorkingSciHubDomain();
        let journalData = {};

        const urlPatterns = PUBLISHER_PATTERNS.flatMap(p => p.journals.map(j => new RegExp(`\\b${j}\\b`, 'i')));
        const urlHasPattern = urlPatterns.some(pattern => pattern.test(window.location.pathname));

        // 检查页面文本是否包含DOI标记
        const bodyText = document.body.textContent || '';
        const hasDOIText = /doi\.org\/10\.\d{4,}\//.test(bodyText) ||
            /DOI:\s*10\.\d{4,}\//.test(bodyText);

        const hasAbstract = !!document.querySelector(
            '[id*="abstract"], [class*="abstract"], ' +
            '[id*="summary"], [class*="summary"], ' +
            '[id*="bibliography"], [class*="bibliography"], ' +
            'section[role="doc-bibliography"]'
        );

        const hasDoiInUrl = /doi/i.test(window.location.href);

        // 检查出版商特定的结构
        const currentHost = window.location.hostname;
        const matchedPublisher = PUBLISHER_PATTERNS.find(p =>
            p.domains.some(d => currentHost.endsWith(d)) &&
            (urlHasPattern && (hasAuthorMeta || hasDOIText || hasAbstract)) ||
            (hasAbstract && hasReferences) ||
            !!extractDOI() || // 如果能够提取到DOI，肯定是论文页面
            hasDoiInUrl
        );

        if (matchedPublisher) {
            const shadowRoot = document.body.attachShadow({ mode: 'open' });
            const fontCss = GM_getResourceText("InterFont");
            const styleSheet = document.createElement('style');
            styleSheet.textContent = fontCss + styles;
            shadowRoot.appendChild(styleSheet);

            const container = document.createElement('div');
            container.id = 'academic-info-container';
            // Re-enabling the green color for high-IF journals as requested.
            if (ifValue >= 20) {
                container.classList.add('high-if');
            }

            let isPinned = false;
            container.addEventListener('mouseenter', () => container.classList.add('is-expanded'));
            container.addEventListener('mouseleave', () => { if (!isPinned) container.classList.remove('is-expanded'); });

            setTimeout(() => displayAcademicInfo(journalData, sciHubDomainPromise), 500);
        }
    }

    // 页面加载完成后执行，使用适当的延迟确保meta标签已加载
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(main, 2000);
    } else {
        window.addEventListener('DOMContentLoaded', () => setTimeout(main, 2000));
    }
})();