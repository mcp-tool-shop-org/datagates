<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/datagates/readme.png" width="400" alt="datagates" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/datagates/actions"><img src="https://github.com/mcp-tool-shop-org/datagates/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/mcp-tool-shop-org/datagates/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://mcp-tool-shop-org.github.io/datagates/"><img src="https://img.shields.io/badge/docs-landing%20page-blue" alt="Landing Page" /></a>
</p>

एक नियंत्रित डेटा प्रचार प्रणाली। डेटा, मौन सफाई के बजाय, परतों वाले गेटों के माध्यम से विश्वास अर्जित करता है।

## यह क्या करता है

डेटागेट्स, डेटासेट की सफाई को एक "**प्रचार समस्या**" के रूप में देखता है। रिकॉर्ड कोड के माध्यम से गुजरने से विश्वसनीय नहीं होते हैं - वे स्पष्ट, संस्करणित, और ऑडिट करने योग्य नियमों के तहत प्रचार प्राप्त करके विश्वसनीय होते हैं।

चार विश्वास परतें, प्रत्येक का अपना गेट:

| परत | गेट | यह क्या पकड़ता है |
|-------|------|-----------------|
| **Row trust** | स्कीमा सत्यापन, सामान्यीकरण, सटीक डुप्लिकेट हटाना | खराब संरचना, अमान्य मान, डुप्लिकेट |
| **Semantic trust** | क्रॉस-फ़ील्ड नियम, निकट-डुप्लिकेट का पता लगाना | विरोधाभास, धुंधले डुप्लिकेट, आत्मविश्वास |
| **Batch trust** | मेट्रिक्स, बहाव का पता लगाना, होल्डआउट ओवरलैप | वितरण में बदलाव, परीक्षण सेट का रिसाव, स्रोत प्रदूषण |
| **Governance trust** | नीति रजिस्ट्री, अंशांकन, शैडो मोड, ओवरराइड | परीक्षण किए गए नीति परिवर्तन, मौन अपवाद, बिना जांचे गए स्रोत |

प्रत्येक संगरोध निर्णय में स्पष्ट कारण शामिल होते हैं। प्रत्येक ओवरराइड के लिए एक स्थायी रसीद की आवश्यकता होती है। प्रत्येक बैच निर्णय को इसके कलाकृतियों से पुनर्निर्मित किया जा सकता है।

## इंस्टॉल करें

```bash
npm install datagates
```

## शुरुआत कैसे करें

```bash
# Initialize a project
npx datagates init --name my-project

# Edit schema.json and policy.json to match your data

# Ingest a batch
npx datagates run --input data.json

# Calibrate against a gold set
npx datagates calibrate

# Compare policies in shadow mode
npx datagates shadow --input data.json

# Review quarantined items
npx datagates review list
```

## सीएलआई कमांड

| कमांड | विवरण |
|---------|-------------|
| `datagates init` | कॉन्फ़िगरेशन, स्कीमा, नीति और गोल्ड सेट के साथ प्रोजेक्ट को आरंभ करें |
| `datagates run` | एक बैच का उपयोग करें, सभी गेटों को निष्पादित करें, निर्णय जारी करें |
| `datagates calibrate` | गोल्ड सेट चलाएं, एफपी/एफएन/एफ1 को मापें, प्रतिगमन का पता लगाएं |
| `datagates shadow` | डेटा को प्रभावित किए बिना सक्रिय बनाम उम्मीदवार नीति की तुलना करें |
| `datagates review` | समीक्षा आइटम की सूची बनाएं, पुष्टि करें, अस्वीकार करें या ओवरराइड करें |
| `datagates source` | डेटा स्रोतों को पंजीकृत करें, जांचें, सक्रिय करें या निलंबित करें |
| `datagates artifact` | बैच निर्णय कलाकृतियों को निर्यात करें या जांचें |
| `datagates promote-policy` | एक नीति को केवल तभी सक्रिय करें जब अंशांकन सफल हो |
| `datagates packs` | उपलब्ध स्टार्टर नीति पैकों की सूची बनाएं |

## नीति पैकेज

शून्य से शासन बनाने के बजाय, एक पूर्व-निर्मित नीति से शुरुआत करें:

- **सख्त-संरचित** — स्वच्छ संरचित डेटा के लिए सख्त सीमाएं
- **टेक्स्ट-डुप्लिकेट** — टेक्स्ट डेटासेट के लिए आक्रामक निकट-डुप्लिकेट का पता लगाना
- **वर्गीकरण-बुनियादी** — लेबल बहाव और वर्ग गायब होने का पता लगाना
- **स्रोत-परीक्षण-पहले** — आंशिक पुनर्प्राप्ति के साथ रूढ़िवादी बहु-स्रोत का उपयोग

```bash
npx datagates init --pack strict-structured
```

## तीन-जोन आर्किटेक्चर

```
Raw (immutable) --> Candidate --> Approved
                        |
                    Quarantine
```

- **कच्चा**: अपरिवर्तनीय इनपुट, कभी भी संशोधित नहीं किया जाता
- **उम्मीदवार**: पंक्ति-स्तरीय गेटों को पार किया गया, बैच निर्णय की प्रतीक्षा
- **अनुमोदित**: बैच-स्तरीय गेटों को पार करने के बाद प्रचारित
- **संगरोध**: एक या अधिक गेटों में विफल, स्पष्ट कारणों के साथ

## प्रोग्रामेटिक एपीआई

```typescript
import { Pipeline, ZoneStore } from 'datagates';

const store = new ZoneStore('datagates.db');
const pipeline = new Pipeline(schema, policy, store);
const result = pipeline.ingest(records);

console.log(result.summary.verdict);
// { disposition: 'approve', reasons: [], warnings: [], ... }
```

## एग्जिट कोड

| कोड | अर्थ |
|------|---------|
| 0 | सफलता |
| 1 | बैच संगरोध |
| 2 | अंशांकन प्रतिगमन |
| 3 | शैडो निर्णय बदला |
| 10 | कॉन्फ़िगरेशन त्रुटि |
| 11 | फाइल गुम |
| 12 | सत्यापन त्रुटि |

## प्रलेखन

- [शुरुआत](docs/QUICKSTART.md) — एंड-टू-एंड पहला रन
- [नीतियाँ](docs/POLICIES.md) — कानून, विरासत, जीवनचक्र
- [अंशांकन](docs/CALIBRATION.md) — गोल्ड सेट और प्रतिगमन
- [समीक्षा](docs/REVIEW.md) — कतार और ओवरराइड रसीदें
- [ऑनबोर्डिंग](docs/ONBOARDING.md) — स्रोत परीक्षण मॉडल
- [कलाकृतियाँ](docs/ARTIFACTS.md) — निर्णय प्रमाण
- [शब्दावली](docs/GLOSSARY.md) — शब्द और अवधारणाएँ

## सुरक्षा

डेटागेट्स केवल **स्थानीय रूप से** काम करता है। यह आपके प्रोजेक्ट निर्देशिका के भीतर फ़ाइलों को पढ़ता और लिखता है - JSON कॉन्फ़िगरेशन, एक SQLite डेटाबेस और निर्णय कलाकृतियाँ। यह कोई नेटवर्क कॉल नहीं करता है, कोई टेलीमेट्री एकत्र नहीं करता है और कोई क्रेडेंशियल नहीं संभालता है। पूर्ण खतरे के मॉडल और रिपोर्टिंग निर्देशों के लिए [SECURITY.md](SECURITY.md) देखें।

## लाइसेंस

एमआईटी

---

यह उपकरण <a href="https://mcp-tool-shop.github.io/">MCP टूल शॉप</a> द्वारा बनाया गया है।
