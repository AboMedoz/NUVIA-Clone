# NUVIA Clone

Bilingual customer-feedback intelligence for Arabic and English. The product goal is to collect survey responses, analyze sentiment/aspects and support evidence-backed business decisions.

## دليل التشغيل من الصفر

المشروع منصة لجمع آراء العملاء بالاستبيانات، وإدارة الأنشطة والفروع والفريق، وعرض الردود والتحليلات والتقارير بالعربي والإنجليزي. الدليل التالي يبدأ من جهاز جديد. أوامر التشغيل لا تنشئ حساب مستخدم افتراضيًا، ولا تنسخ قاعدة بيانات صاحب المشروع أو مفاتيحه.

الريبو **Private**: لازم صاحب المشروع يضيفك كمشارك على GitHub وتقبل الدعوة قبل التنزيل. كل مطور يجهّز إعداداته الخاصة واتصال قاعدة البيانات المصرح له باستخدامه.

### 1. المتطلبات

| الأداة  | المطلوب                                       | استخدامها                                           |
| ------- | --------------------------------------------- | --------------------------------------------------- |
| Git     | إصدار مثبت ومتاح في الطرفية                   | تنزيل المشروع وتحديثه                               |
| Node.js | `22.13.0` أو أحدث؛ إصدار 22 هو المستخدم في CI | تشغيل الواجهة والباك والمكتبات                      |
| pnpm    | `11.25.0`                                     | تثبيت مكتبات JavaScript من ملف القفل                |
| Python  | `3.11` أو أحدث                                | خدمة AI؛ غير مطلوب عند تشغيل الويب والباك فقط       |
| uv      | `0.12.15`                                     | تجهيز بيئة Python المعزولة وتشغيلها                 |
| MongoDB | Atlas أو replica set محلية                    | حفظ البيانات وتشغيل المعاملات؛ standalone غير كافية |
| متصفح   | متصفح حديث                                    | استخدام التطبيق                                     |

نزّل Git من [الموقع الرسمي](https://git-scm.com/downloads)، وNode.js من [صفحة التنزيل الرسمية](https://nodejs.org/en/download)، وPython من [python.org](https://www.python.org/downloads/). اتبع [دليل تثبيت uv الرسمي](https://docs.astral.sh/uv/getting-started/installation/)؛ ويمكن تثبيت الإصدار المستخدم في المشروع عبر Python:

```sh
python -m pip install uv==0.12.15
npm install --global pnpm@11.25.0
```

على Linux/macOS قد يكون اسم أمر Python هو `python3` بدلًا من `python`. افتح طرفية جديدة بعد التثبيت، وتأكد أن الأدوات متاحة:

```sh
git --version
node --version
pnpm --version
python --version
uv --version
```

Docker اختياري، وكارت الشاشة ليس مطلوبًا لتشغيل التطبيق وخدمة AI الأساسية. أول تثبيت للمكتبات يحتاج إنترنت ومساحة للبيئات المحلية. تثبيت أوزان المودلز له متطلبات منفصلة حسب الحزمة.

### 2. تنزيل المشروع

```sh
git clone https://github.com/mosv7/NUVIA-Clone.git
cd NUVIA-Clone
```

استخدم حساب GitHub الذي قبل دعوة الوصول عند طلب تسجيل الدخول. لو ظهر `Repository not found`، تأكد من الحساب والدعوة. لا تضع access token في رابط التنزيل أو داخل ملفات المشروع. يمكن استخدام Download ZIP وفكّه بدل Git، لكن التحديث عبر `git pull` يتطلب نسخة مستنسخة بـGit.

كل الأوامر التالية تُنفّذ من **جذر المشروع**، وهو المجلد الذي يحتوي على `package.json` و`START-FULL.cmd`.

### 3. تجهيز المكتبات والإعدادات الخاصة

```sh
pnpm install --frozen-lockfile
pnpm setup:local
```

الأمر الثاني ينشئ ملف `.env` محليًا مع مفتاح تشفير بريد عشوائي، ويحافظ على الملف إن كان موجودًا. افتح `.env` بأي محرر؛ على Windows يمكن استخدام:

```powershell
notepad .env
```

لا تستبدل الملف المتولد بنسخة `.env.example` بعد تجهيز المفتاح. استخدم `.env.example` كمرجع للأسماء فقط، وأضف أو عدّل القيم المطلوبة مع الحفاظ على `MAIL_ENCRYPTION_KEY`.

### 4. تجهيز MongoDB

اختر مسارًا واحدًا: **Atlas للتشغيل العادي على جهازك**، أو **Docker لتشغيل قاعدة محلية مع باقي الخدمات** كما في القسم التالي. سكريبت Windows لا ينشئ سيرفر MongoDB ولا يختار قاعدة بديلة تلقائيًا.

**مسار Atlas:** أنشئ cluster، ثم database user، واسمح بعنوان IP الخاص بجهازك في Network Access. انسخ اتصال التطبيق من Atlas، واستبدل placeholders بالمستخدم وكلمة المرور والعنوان الخاصين بك. بيانات database user تختلف عن تسجيل الدخول لموقع Atlas. راجع [توثيق MongoDB](https://www.mongodb.com/docs/get-started/).

أضف إلى `.env`، مع إبقاء مفتاح البريد المتولد:

```dotenv
MONGODB_URI=mongodb+srv://YOUR_DB_USER:YOUR_URL_ENCODED_PASSWORD@YOUR_CLUSTER_HOST/?retryWrites=true&w=majority
MONGODB_DATABASE=nuvia_clone
APP_ORIGIN=http://127.0.0.1:5173
MAIL_MODE=file
```

القيم المكتوبة بحروف كبيرة في رابط الاتصال أمثلة يجب استبدالها. الحروف الخاصة في كلمة المرور تحتاج URL encoding. لا تنشر رابط الاتصال ولا تعطل التحقق من TLS لحل مشكلة اتصال. لا تستخدم قاعدة عملاء مشتركة في الاختبارات.

لو عندك MongoDB محلية مجهزة بالفعل كـreplica set اسمها `rs0`، يكون مثال الاتصال:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/?replicaSet=rs0
```

اسم replica set في الرابط يجب أن يطابق إعداد السيرفر الحقيقي؛ إضافة الاسم للرابط لا تحوّل standalone إلى replica set.

بعد ضبط الاتصال:

```sh
pnpm db:check
pnpm db:setup
```

`db:check` يتحقق من الاتصال بلا كتابة بيانات. `db:setup` يجهّز الفهارس وبيانات إصدار المخطط بشكل إضافي؛ لا يحذف الفهارس أو بيانات العملاء. بدء الـAPI يجري تجهيز المخطط أيضًا. الحسابات والردود تبقى محفوظة في قاعدة البيانات المختارة، ولا تنتقل تلقائيًا بين Atlas وDocker.

### 5. التشغيل الكامل على Windows

بعد تثبيت المتطلبات وضبط قاعدة البيانات، افتح [START-FULL.cmd](START-FULL.cmd) بدبل كليك، أو من PowerShell داخل المشروع:

```powershell
.\START-FULL.cmd
```

السكريبت ينفّذ بالترتيب: تثبيت JavaScript من القفل، تجهيز الإعدادات مع الحفاظ على الموجود، تجهيز Python من `uv.lock`، إضافة إعدادات AI الداخلية الناقصة، فحص MongoDB، ثم تشغيل **الواجهة + API + عامل البريد + خدمة AI**. `START-LAPTOP.cmd` يشغّل نفس السكريبت.

انتظر ظهور `NUVIA ready at http://127.0.0.1:5173/`، ثم افتح [التطبيق](http://127.0.0.1:5173/). احتفظ بنافذة التشغيل مفتوحة. للإيقاف اضغط `Ctrl+C`؛ المجموعة توقف العمليات التي بدأتْها، ولا تغلق برامج أخرى أو تحذف قاعدة البيانات. إذا طلب Windows تأكيد إيقاف ملف الأوامر، وافق لإغلاق السكريبت.

لرؤية المتطلبات دون تثبيت أو تشغيل:

```powershell
.\START-FULL.cmd --help
```

### 6. التشغيل بالأوامر على Windows / Linux / macOS

بعد خطوات التنزيل وإعداد `.env` وMongoDB:

```sh
uv sync --project apps/ai-service --locked
pnpm setup:models
pnpm dev:full
```

عند التشغيل التالي، يكفي `pnpm dev:full` طالما المكتبات والإعدادات جاهزة. بعد سحب تحديثات تغيّر ملفات القفل، أعد `pnpm install --frozen-lockfile` و`uv sync --project apps/ai-service --locked` قبل التشغيل.

| الخدمة                     | عنوانها في التشغيل العادي                   |
| -------------------------- | ------------------------------------------- |
| واجهة التطبيق              | `http://127.0.0.1:5173/`                    |
| جاهزية API وقاعدة البيانات | `http://127.0.0.1:3001/api/v1/health/ready` |
| حياة خدمة AI               | `http://127.0.0.1:8000/api/v1/health/live`  |

المنافذ `5173` و`3001` و`8000` يجب أن تكون متاحة. الواجهة ترسل طلبات API عبر نفس origin؛ فتح صفحة health لا يثبت جاهزية موديلات التحليل. استخدم `127.0.0.1` كما هو في `APP_ORIGIN`، ولا تستبدله بـ`localhost` أو عنوان شبكة دون تعديل الإعدادات المرتبطة. خدمة Python داخلية؛ المتصفح يتعامل مع Node، ومفتاح AI لا يدخل الواجهة.

لتشغيل الواجهة والباك والبريد **بدون Python/AI**:

```sh
pnpm dev
```

يمكنك استخدام الحسابات والاستبيانات وجمع الردود والبيانات المحفوظة؛ التحليل المتعلم يعرض حالة عدم التوفر. لا تشغّل `pnpm dev` و`pnpm dev:full` معًا على نفس المنافذ.

### 7. بديل Docker: قاعدة محلية وباقي الخدمات

هذا مسار مستقل عن تشغيل Windows/Node العادي. ثبّت Docker وشغّل daemon، ثم من جذر المشروع:

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm setup:models
docker compose --profile ai up --build -d
docker compose ps
```

افتح `http://127.0.0.1:5173/`. هذا المسار ينشئ MongoDB replica set داخل شبكة Docker ويشغّل web/API/mail/AI. لا يحتاج تثبيت Python على المضيف، ولا يستخدم رابط Atlas في `.env`؛ قاعدة Compose اسمها `nuvia_development` وتختلف عن قاعدة التشغيل العادي. النموذج الافتراضي محلي، وحزم المودلز تُربط من `.local/models` ولا تُنسخ إلى الصور. اقرأ [تفاصيل Docker](infra/README.md) قبل تغيير الإعدادات.

لإيقاف الحاويات مع الحفاظ على بياناتها:

```sh
docker compose --profile ai down
```

لا تضف `--volumes` إلا عند قصد حذف قاعدة Docker. لا تشغّل مسار Docker ومسار `pnpm dev:full` معًا على نفس منافذ الواجهة والـAI. هذا إعداد تطوير محلي وليس نشرًا إنتاجيًا.

### 8. أول استخدام بعد التشغيل

1. افتح `http://127.0.0.1:5173/#/signup` وأنشئ حسابك. لا يوجد اسم مستخدم أو كلمة مرور افتراضية.
2. مع `MAIL_MODE=file`، افتح ملف JSON الخاص برسالة التحقق لهذا الحساب في `.local/mail/`، وانسخ الرابط الكامل من حقل `text` وافتحه. اختَر الرسالة المناسبة حسب المستلم ونوعها؛ أحدث ملف ليس بالضرورة رسالة حسابك. عامل البريد يعمل ضمن مجموعة التشغيل.
3. سجّل الدخول، وأكمل بيانات النشاط والفرع. يمكنك تغيير اللغة من الواجهة.
4. أنشئ استبيانًا من Surveys، وأضف أسئلته، وانشره للفروع المطلوبة، ثم انسخ الرابط العام أو نزّل QR.
5. افتح الرابط العام في نافذة منفصلة وأرسل ردًا. راجع Feedback والعدادات الحقيقية، ثم جرّب CSV أو تقريرًا محفوظًا.
6. جرّب إعادة تحميل الصفحة ثم الخروج والدخول للتحقق من حفظ البيانات.

رسائل `.local/mail/` خاصة وتحتوي على روابط تحقق/استعادة؛ لا ترفعها إلى GitHub. File mode لا يرسل إلى Gmail أو صندوق بريد حقيقي. إرسال البريد الحقيقي يحتاج إعداد SMTP واختبار المزود.

### 9. ما المطلوب لتفعيل AI وGoogle والدفع؟

تشغيل خدمة AI لا يثبت وجود أوزان متعلمة. الوظائف الأساسية مثل تجهيز النصوص تعمل دونها؛ sentiment/aspects والتجميع والتوقعات والتوليد تنتظر حزمة متوافقة. لا يحتوي الريبو على أوزان مدرّبة أو نتائج تحليل وهمية.

- **مودلز محلية:** اتبع [دليل حزم المودلز](apps/ai-service/docs/model-packages.md) و[جدول تسليم المودلز بالعربي](docs/ai-model-handoff-ar.md)، وثبّت runtime الإضافي المناسب للحزمة. لا يكفي وضع ملف أوزان عشوائي في المجلد.
- **Gemini اختياري:** [دليل الإعداد والتبديل](docs/development/gemini-ar.md). يحتاج مفتاحًا خاصًا واختيار المزود صراحةً؛ لا يوجد تحويل تلقائي من local إلى خدمة مدفوعة.
- **Google وStripe:** [دليل التكامل والإعدادات](docs/development/external-integrations.md). بيانات المزود والأسعار والـwebhook وموافقة OAuth ليست ضمن الريبو. عدم ضبطها لا يمنع الحسابات العادية وجمع الردود، لكنه يبقي التكامل المقابل غير متاح.
- **نصوص الموقع:** متغيرات `PUBLIC_*_TEXT` الاختيارية في `.env.example` لنشر محتوى الفريق المعتمد؛ لا يُنشأ نص قانوني أو رابط شركة تلقائيًا.

الإعدادات الحساسة تبقى في `.env` أو بيئة التشغيل. لا تستخدم بادئة `VITE_` لمفاتيح الخدمات، لأنها قد تُضمّن في كود المتصفح. حزم المودلز و`.local/` والبيانات الخاصة غير مرفوعة.

### 10. التحديث وقواعد البيانات القديمة

بعد حفظ تغييراتك المحلية:

```sh
git pull --ff-only
pnpm install --frozen-lockfile
uv sync --project apps/ai-service --locked
```

أوقف مجموعة التطوير ثم شغّلها مرة أخرى. أوامر التجهيز تحافظ على الإعدادات الحالية؛ لا تستبدل مفتاح البريد أثناء التحديث. لو ظهرت `WORKSPACE_MIGRATION_REQUIRED` عند إضافة نشاط ثانٍ لقاعدة قديمة، اقرأ [الترقية الصريحة لتعدد الأنشطة](docs/api/multi-workspace.md). ابدأ بالمعاينة فقط:

```sh
node apps/api/scripts/migrate-multi-workspace.mjs
```

المعاينة لا تطبق التغيير. راجع القاعدة والنسخة الاحتياطية ودليل الترقية قبل استخدام `--apply`. القواعد الجديدة لا تحتاج إزالة فهرس قديم غير موجود لديها.

### 11. حل مشاكل التشغيل

| المشكلة                                         | ما يجب مراجعته                                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `node` أو `pnpm` أو `uv` غير معروف              | ثبّت الأداة وافتح طرفية جديدة وتحقق من PATH والإصدارات المطلوبة                          |
| فشل التثبيت بـ`--frozen-lockfile` أو `--locked` | تأكد من الفرع الصحيح والإصدار والاتصال؛ لا تحذف ملفات القفل ولا تنشئ `package-lock.json` |
| `MongoDB check failed`                          | رابط الاتصال، database user، IP المسموح، كلمة المرور المشفرة، DNS والاتصال بالشبكة       |
| خطأ معاملات / replica set                       | تأكد أن MongoDB ليست standalone وأن اسم replica set في الرابط صحيح                       |
| `Port ... is already in use`                    | أوقف النسخة السابقة من نافذتها؛ السكريبت لا يقتل برامج أخرى أو يبدّل المنافذ تلقائيًا    |
| الواجهة تفتح لكن الحفظ يرفض Origin/CSRF         | استخدم عنوان `APP_ORIGIN` نفسه، وشغّل الباك والواجهة معًا ثم أعد تحميل الصفحة            |
| رسالة التحقق لم تصل إلى البريد                  | في file mode ابحث عن رسالة الحساب المناسبة في `.local/mail/`؛ للإرسال الحقيقي اضبط SMTP  |
| رابط تحقق أو استعادة غير صالح                   | استخدم أحدث رسالة صالحة لهذا الإجراء؛ التوكنات مؤقتة وأحادية الاستخدام                   |
| AI يعرض `waiting_for_model` أو unavailable      | راجع جاهزية capability وحزمة الموديل/runtime؛ صفحة health ليست اختبار inference          |
| الحساب أو الردود تبدو مختفية                    | راجع اختيار النشاط واتصال قاعدة البيانات؛ Atlas وقاعدة Docker منفصلتان                   |
| Google أو الدفع غير متاح                        | أضف إعدادات المزود الخاصة وفق الدليل؛ لا توجد مفاتيح تجريبية مشتركة داخل الريبو          |
| المتصفح يرفض رابط الاستبيان                     | تأكد أنه منشور وله رابط فرع مفعل؛ إغلاق الجمع أو أرشفة الفرع يعطل الرابط                 |

لرؤية التصميم فقط دون قاعدة بيانات أو AI: نفّذ `pnpm dev:web` وافتح `http://127.0.0.1:5173/preview/#/dashboard`. بيانات المعاينة توضيحية، وليست نتائج حساب حقيقي.

الأقسام الإنجليزية التالية توضح المعمارية والأوامر والعقود والاختبارات بمزيد من التفاصيل.

## Current delivery

The active interface uses the supplied `Frontend.zip` design with real account adapters. See [approved interface integration](docs/development/approved-frontend.md) and [Google/Stripe setup](docs/development/external-integrations.md).

- **Connected product:** owner accounts, saved business/branches, versioned questionnaires, branch-specific public links and QR, anonymous validated submissions, feedback/filtering/CSV, real-data aggregates and report snapshots, public business page, and Owner/Manager/Viewer team permissions.
- **Model infrastructure:** authenticated Node-to-FastAPI tasks, deterministic bilingual text preparation, capability readiness, validated local model packages, persistent analysis jobs/retries and evidence-backed result contracts. Learned features display waiting/unavailable states until compatible models are installed.
- **Model handoff:** the user/team supplies trained artifacts later. No trained model or scientific accuracy claim is included. See the [model installation guide](apps/ai-service/README.md).
- **Preview only:** synthetic metrics, feedback and canned replies remain under `/preview/`; they never count as real account analytics.
- **External setup:** Google OAuth and Stripe hosted billing integrations require provider credentials and live acceptance. Plan limits and scientific model quality remain separately evaluated. See the [feature acceptance matrix](docs/product/implementation-matrix.md) for per-feature behavior and validation limits.

The JavaScript applications use React/Vite and Node.js/Express/Mongoose. JavaScript/JSX and `.mjs` are intentionally retained; this restructuring does not migrate the applications to TypeScript.

## Repository structure

```text
apps/
  web/                       React/Vite application and its tests
    src/
      app/                   Router, providers and state ownership
      features/approved-ui/  Approved active pages, supplied styles and adapters
      features/              Retained auth/product transport and supplemental flows
      components/ui/         Shared controls
      components/layout/     Shared workspace shell and layout CSS
      hooks/                 Shared responsive behavior
      lib/                   HTTP client, assets, i18n and formatting
      styles/                Global styles and tokens
  api/                       Express application, operational scripts and tests
    src/
      config/                Root-relative private configuration
      modules/               auth/account, workspaces/team, surveys/feedback,
                             analytics/reports, actions/search, billing, mail
      middleware/            Security, limits and safe HTTP errors
      integrations/          Mail transport and authenticated AI-service client
      shared/database/       Connection-scoped Mongoose models and transactions
  ai-service/                FastAPI tasks, model adapters/manifests, tests, uv.lock
packages/shared-types/       Public DTO declarations and shared API constants
infra/docker/                Development images and replica-set initialization
infra/nginx/                 Same-origin web/API routing for compose
scripts/                     Cross-platform development orchestration
tests/e2e/                   Cross-application browser account lifecycle
docs/architecture/           Current system/storage ownership and decisions
docs/api/                    Implemented public API contracts
docs/development/            Development, validation and extension guides
docs/product/                Requirements and full feature map
docs/ui/                     Approved screen galleries and screenshots
docs/archive/                Clearly marked earlier proposals
.github/workflows/           Workspace, Python scaffold and container checks
compose.yaml                 Optional local container stack
pnpm-workspace.yaml          JavaScript workspace membership
pnpm-lock.yaml               Shared reproducible JavaScript dependency graph
```

Each application owns its dependencies and unit/integration tests. Root tooling owns cross-app checks and browser tests. `@nuvia/shared-types` exports public constants and `.d.ts` declarations for editor/JSDoc use; Mongoose models and private server data never enter the browser package. Read the [architecture](docs/architecture/architecture.md) and [developer guide](docs/development/monorepo.md) before adding a module.

## Quick start: connected web and API

Prerequisites: Node.js >=22.13 and **pnpm 11.25.0**. If pnpm is missing, install it with `npm install --global pnpm@11.25.0`. Python and Docker are optional for this flow.

```sh
git clone https://github.com/mosv7/NUVIA-Clone.git
cd NUVIA-Clone
pnpm install --frozen-lockfile
pnpm setup:local
```

`setup:local` creates the root `.env` with a generated mail-encryption key and preserves an existing file. Add a private `MONGODB_URI` there, preserving that key. Use Atlas, or a local MongoDB **replica set**; a standalone instance cannot run the transactions. Atlas needs a database user and network access for your current public IP, but does not require MongoDB installed on your computer.

```dotenv
MONGODB_URI=mongodb+srv://YOUR_DB_USER:YOUR_URL_ENCODED_PASSWORD@YOUR_CLUSTER_HOST/
MONGODB_DATABASE=nuvia_clone
APP_ORIGIN=http://127.0.0.1:5173
MAIL_MODE=file
```

Replace the URI placeholders. Never commit credentials. Private Atlas settings may also live in `.local/config/atlas-credentials.env`; root `.env` overrides them and process environment overrides both. Production reads process environment only. Package-local commands use the same repository-root configuration; they do not create a second `.env` or mailbox inside `apps/api`.

```sh
pnpm db:check
pnpm db:setup
pnpm dev
```

`db:check` authenticates and pings without writes. `db:setup` creates declared indexes/schema metadata without dropping existing indexes; API startup also performs setup. `pnpm dev` starts API, mail worker and web together, checks default ports first, and stops its own process group on Ctrl+C or a service failure. It does not change the database URI or stop unrelated processes.

Open [the app](http://127.0.0.1:5173/). API traffic is proxied to port 3001. Use `127.0.0.1`, not `localhost`, unless `APP_ORIGIN` is updated to match. The frontend/API/mail commands remain available separately:

```sh
pnpm dev:web
pnpm dev:api
pnpm mail:work
```

Run those in separate terminals if you choose that mode. Windows users can double-click `START-FULL.cmd` (or `START-LAPTOP.cmd`, which delegates to it) to prepare locked JavaScript/Python dependencies, preserve/create private settings, check MongoDB and start web/API/mail/AI together. Install Node.js >=22.13, pnpm 11.25.0 and uv 0.12.15 first; dependency setup may need Internet access. Configure a usable Atlas/replica-set URI before startup. The script never changes the database selection or downloads trained models; missing learned capabilities remain unavailable. Keep its window open and use Ctrl+C to stop the group. `START-FULL.cmd --help` shows prerequisites without setup or starting services. For web/API/mail without Python, use `pnpm dev`. `pnpm dev:network` exposes only the frontend for LAN previews; connected LAN access also requires correct backend host/origin/mail-link settings.

## Try what is implemented

1. Open [Create account](http://127.0.0.1:5173/#/signup) and register. No shared/default account is shipped.
2. Keep the mail worker running. With `MAIL_MODE=file`, open the newest corresponding JSON message in the root `.local/mail/` and follow the complete URL in its `text` field on the same computer.
3. After verification, log in, save business information and configure the primary branch.
4. Enter Overview, refresh or sign out/in, and check that saved setup persists.
5. Open Surveys, create a questionnaire or copy a template, choose a branch and publish. Open the public share link in a separate browser context and submit a response. Each link binds its branch and immutable published revision.
6. Revisit Feedback and Overview: the saved response and real counts appear. Sentiment/aspect results stay unavailable until a compatible model produces validated output. Export filtered CSV, manage branches/team, or create a saved report evidence snapshot.
7. For recovery, use [Forgot password](http://127.0.0.1:5173/#/forgot) and follow the reset link in its corresponding local message. Reset links expire, are single-use and revoke existing sessions when consumed.

Local mailbox files are **not Gmail delivery**. Real email requires SMTP provider configuration and acceptance testing. Messages contain private verification/reset URLs; do not share them. Data belongs to the selected database; accounts do not automatically transfer between local MongoDB, compose and Atlas.

## Review UI without the backend

Run `pnpm dev:web`, then open [Landing](http://127.0.0.1:5173/preview/#/landing), [Overview](http://127.0.0.1:5173/preview/#/dashboard), [empty Overview](http://127.0.0.1:5173/preview/#/dashboard-empty), [Feedback](http://127.0.0.1:5173/preview/#/feedbacks), [empty Feedback](http://127.0.0.1:5173/preview/#/feedbacks-empty) or [response details](http://127.0.0.1:5173/preview/#/feedback-details).

Previews use illustrative data and do not create a real session or demonstrate completed AI services. `pnpm build` builds `apps/web/dist`; `pnpm preview` serves it locally without starting backend services. `pnpm previews` creates standalone review HTML in the root ignored `previews/` after building. See the [reviewed gallery](docs/ui/frontend/README.md).

## Model-ready Python service

Optional online Gemini support can be selected explicitly while preserving all
local model packages and adapters. The default remains local; no cloud fallback
occurs. See [Gemini setup and switching](docs/development/gemini-ar.md).

Use Python >=3.11 and uv 0.12.15:

```sh
uv sync --project apps/ai-service --locked
pnpm setup:models
pnpm dev:full
```

`setup:models` preserves existing private settings and adds a shared service key
and ignored `.local/models` package directory. `dev:full` starts the web/API/mail
and loopback AI service together, using the already installed Python environment
offline. Ordinary `pnpm dev` remains available without Python. Do not run both
development groups at the same time.

The service exposes authenticated capability/task endpoints. Language detection,
Arabic normalization and sentence spans work without trained models. Learned
sentiment/aspects, clusters, forecasts, reports and assistant generation wait for
compatible packages. A raw weights file alone is insufficient: the package needs
the documented manifest, hashes, supported adapter and task contract. Model
installation, optional runtime extras and smoke commands are in [the AI guide](apps/ai-service/README.md).
Node retains authorization and persistence; Python never writes to MongoDB.

An optional `AI_PYTHON_EXECUTABLE` points to an existing compatible local Python
environment. The launcher uses it directly without installing into or modifying
that environment. Leave it empty for the clone's locked uv environment. Reusing
an existing local CUDA environment is machine-specific; it is not a portable
model package or evidence of model quality.

See [the Arabic model handoff table](docs/ai-model-handoff-ar.md) for which
capabilities need supplied models and which can share weights.

```sh
pnpm test:launcher
pnpm test:e2e:models
# Local Mongo acceptance: set MONGOMS_SYSTEM_BINARY to your installed mongod path.
pnpm test:e2e:product
```

## Optional local containers

Docker Desktop/the Docker daemon must be running. Run `pnpm setup:local` first to create the private mail key, then:

```sh
docker compose up --build -d
```

Open `http://127.0.0.1:5173/`. This builds the web/API, starts a **separate local MongoDB replica set** and mail worker, and routes API calls through nginx on the same browser origin. MongoDB is internal to the compose network; the root `.env` Atlas URI is not used by this stack. Messages appear in `.local/mail/`; database data persists in the `mongo-data` volume.

Before enabling the AI profile, run `pnpm setup:models` to create the private shared service key. Add the model-ready AI service with `docker compose --profile ai up --build -d`. Stop services with `docker compose --profile ai down`; do not add `--volumes` unless you intend to delete the compose database. This is a loopback-bound HTTP development setup, not a production deployment or CD pipeline. It does not copy credentials into images. See [infrastructure details](infra/README.md).

## Validation and CI

```sh
pnpm format:check
pnpm lint
pnpm test                 # Web and API package suites
pnpm build
pnpm test:backend:unit
pnpm test:e2e:accounts
pnpm test:e2e:product:browser # Connected survey/response/export UI with isolated data
pnpm test:ai              # Optional Python/uv environment required
```

The existing suite covers account security, owner isolation, persisted setup, failure recovery, Mongoose/legacy-data compatibility and EN/AR/mobile behavior. Package-local tests are under `apps/web/tests` and `apps/api/tests`; cross-app browser evidence is generated in root `test-results/accounts/`. Tests use synthetic identities and isolated replica sets, not configured application/customer databases.

API integration/browser tests can download MongoDB on first run; Windows reuses an existing ignored `.local/tools/mongod.exe`. Browser tests use Edge, `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, or installed Playwright Chromium (`pnpm exec playwright install chromium`). Dependencies are pinned by `pnpm-lock.yaml` and the Python `uv.lock`; do not create application npm lockfiles.

GitHub Actions is configured for web formatting/lint/tests/build, API/browser and
product collection checks, Python service and Node-to-Python contracts, and the
optional container stack. This describes configured checks, not evidence of a
remote CI run for this clone. Local results and remaining limits are recorded in
[the comprehensive QA report](docs/development/comprehensive-qa.md) and
[the earlier delivery report](docs/development/clone-validation.md). SMTP, Atlas,
production deployment and trained-model quality require separate acceptance.

## Documentation

- [Documentation index](docs/README.md) and [Arabic getting started](docs/getting-started-ar.md).
- [Architecture](docs/architecture/architecture.md), [current MongoDB models](docs/architecture/mongodb-models.md), [API](docs/api/README.md) and [backend operations](docs/development/backend.md).
- [Developer guide](docs/development/monorepo.md), [workspace boundaries](docs/development/module-boundaries.md), [decisions](docs/decisions/) and [repository guidelines](AGENTS.md).
- [Full 51-feature product map](docs/product/feature-list.md), [requirements](docs/product/requirements.md) and [future AI pipeline](docs/architecture/ai-pipeline.md). Feature scope is broader than current delivery.
- [Earlier architecture/API/database proposals](docs/archive/README.md) remain historical, separate from implemented contracts.

No open-source license has been selected. Keep focused PRs, report actual validation and limitations, preserve private data, and use branch names without `codex/`.
