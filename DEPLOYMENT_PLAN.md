# CGEN Deployment Plan
## GitHub · MongoDB Atlas · Cloudflare R2 · Render

---

> **Project:** Contract Management System (CGEN)  
> **Stack:** React (Vite) + Node.js/Express + MongoDB + LaTeX (pdflatex)  
> **Target:** GitHub (source) · Render (backend) · GitHub Pages or Render Static (frontend) · MongoDB Atlas (database) · Cloudflare R2 (file storage)

---

## Pre-Flight Checklist

Before starting any phase, collect the following. You will need them in later steps.

| Item | Where to Get It |
|---|---|
| MongoDB Atlas connection string | atlas.mongodb.com → Connect → Drivers |
| Cloudflare R2 Account ID | dash.cloudflare.com → R2 → Overview |
| Cloudflare R2 Access Key ID | R2 → Manage R2 API Tokens |
| Cloudflare R2 Secret Access Key | Same as above |
| Cloudflare R2 Bucket name | You will create this in Phase 2 |
| Cloudflare R2 Public URL | Enabled in R2 bucket settings |
| Render account | render.com |
| GitHub account + repo | github.com |

---

## Phase 1 — GitHub Repository Setup

**Goal:** Push the CGEN codebase to GitHub with a clean structure and proper `.gitignore` so secrets and binary artifacts are never committed.

### 1.1 Initialize the Repository

```bash
# Inside your CGEN project root
git init
git branch -M main
```

### 1.2 Create `.gitignore` at the project root

Create a file named `.gitignore` in the `CGEN/` root:

```
# Dependencies
node_modules/
backend/node_modules/
frontend/node_modules/

# Environment files — NEVER commit these
.env
backend/.env
frontend/.env
frontend/.env.local

# Build output
frontend/dist/
frontend/build/

# Local uploads and generated files — will live in R2
backend/uploads/
backend/temp/

# LaTeX compilation artifacts
*.aux
*.log
*.out
*.synctex.gz

# OS
.DS_Store
Thumbs.db
```

### 1.3 Create `.env.example` files (safe templates)

**`backend/.env.example`:**
```
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/contract_management
JWT_SECRET=your_jwt_secret_here

# Cloudflare R2
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_NAME=cgen-uploads
R2_PUBLIC_URL=https://your-bucket.your-account.r2.cloudflarestorage.com
```

**`frontend/.env.example`:**
```
VITE_API_URL=https://your-render-backend.onrender.com
```

### 1.4 Push to GitHub

```bash
git add .
git commit -m "Initial commit: CGEN contract management system"
git remote add origin https://github.com/YOUR_USERNAME/cgen.git
git push -u origin main
```

> ✅ **Phase 1 Done:** Source code is on GitHub. No secrets, no uploads folder, no node_modules.

---

## Phase 2 — MongoDB Atlas Setup

**Goal:** Replace the local `mongodb://localhost:27017/contract_management` connection with a cloud Atlas cluster.

### 2.1 Create Atlas Cluster

1. Go to [atlas.mongodb.com](https://atlas.mongodb.com) and sign in.
2. Click **Create a Cluster** → choose **Free (M0)** tier → select a region close to your Render backend (e.g., AWS Singapore for PH users).
3. Set a database user: **Database Access** → Add New Database User → username + strong password. Save these.
4. Whitelist all IPs: **Network Access** → Add IP Address → `0.0.0.0/0` (Render uses dynamic IPs, so this is required).

### 2.2 Get Your Connection String

In Atlas → your cluster → **Connect** → **Drivers** → Node.js. Copy the string:

```
mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/contract_management?retryWrites=true&w=majority
```

Replace `<username>` and `<password>` with your actual credentials.

### 2.3 Migrate Existing Local Data

Run these commands on the machine where your local MongoDB currently runs:

```bash
# Export every collection from local MongoDB
mongodump --uri="mongodb://localhost:27017/contract_management" --out=./cgen-dump

# Import into Atlas (replace the URI with yours)
mongorestore --uri="mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/contract_management" \
  --drop \
  ./cgen-dump/contract_management
```

**Verify the import:**

```bash
mongosh "mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/contract_management" \
  --eval "db.stats()"
```

Check that `collections` and `objects` counts match what you had locally.

> ✅ **Phase 2 Done:** All existing MongoDB data is now in Atlas. The local database is no longer needed.

---

## Phase 3 — Cloudflare R2 Setup

**Goal:** Replace the local `backend/uploads/` and `backend/temp/` disk folders with Cloudflare R2 object storage.

### 3.1 Create the R2 Bucket

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **R2** → **Create Bucket**.
2. Bucket name: `cgen-uploads` (or your preference — no spaces, lowercase).
3. Region: Automatic (Cloudflare picks the closest edge).

### 3.2 Enable Public Access (for serving files)

Inside the bucket → **Settings** → **Public Access** → **Allow Access** → copy the public bucket URL. It will look like:

```
https://pub-xxxxxxxxxxxxxx.r2.dev
```

Or set up a custom domain under **Custom Domains** (optional but recommended for production).

### 3.3 Create an R2 API Token

1. R2 Overview page → **Manage R2 API Tokens** → **Create API Token**.
2. Permissions: **Object Read & Write**.
3. Scope: Limit to your `cgen-uploads` bucket.
4. Save the **Access Key ID** and **Secret Access Key** — you will not see them again.

### 3.4 Create R2 Folder Structure

R2 has no real folders but you can simulate them with key prefixes. The app will use:

```
cgen-uploads/
  profile-photos/       ← user profile images
  documents/            ← user uploaded documents (contracts, IDs)
  signed-contracts/     ← uploaded signed PDFs
  generated-contracts/  ← pdflatex-generated PDFs (optional, if you cache them)
```

No action needed now — keys will be created automatically when files are uploaded.

### 3.5 Migrate Existing `uploads/` Folder to R2

Install the AWS CLI (R2 is S3-compatible):

```bash
pip install awscli
```

Configure a named profile for R2:

```bash
aws configure --profile r2
# AWS Access Key ID: your R2 Access Key ID
# AWS Secret Access Key: your R2 Secret Access Key
# Default region: auto
# Default output format: json
```

Upload your existing uploads folder:

```bash
# Upload profile photos (adjust path to your actual uploads folder)
aws s3 cp ./backend/uploads/ s3://cgen-uploads/ \
  --recursive \
  --endpoint-url https://<YOUR_ACCOUNT_ID>.r2.cloudflarestorage.com \
  --profile r2

# Optional: verify what was uploaded
aws s3 ls s3://cgen-uploads/ \
  --endpoint-url https://<YOUR_ACCOUNT_ID>.r2.cloudflarestorage.com \
  --profile r2
```

> ✅ **Phase 3 Done:** All existing files are in R2. The local `uploads/` folder is backed up and can be archived.

---

## Phase 4 — Backend Code Changes for R2

**Goal:** Swap `multer` disk storage and `fs` file reads for R2 using the AWS SDK (S3-compatible).

### 4.1 Install AWS SDK in the Backend

```bash
cd backend
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage multer-s3
```

### 4.2 Create `backend/config/r2.js`

```js
import { S3Client } from '@aws-sdk/client-s3';

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export const R2_BUCKET = process.env.R2_BUCKET_NAME;
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;
```

### 4.3 Create `backend/utils/r2Upload.js`

This replaces multer's disk storage with R2:

```js
import multer from 'multer';
import multerS3 from 'multer-s3';
import { r2Client, R2_BUCKET } from '../config/r2.js';
import path from 'path';

// General document upload → documents/ prefix
export const documentUpload = multer({
  storage: multerS3({
    s3: r2Client,
    bucket: R2_BUCKET,
    key: (req, file, cb) => {
      const timestamp = Date.now();
      const ext = path.extname(file.originalname);
      cb(null, `documents/${timestamp}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// Profile photo upload → profile-photos/ prefix
export const profilePhotoUpload = multer({
  storage: multerS3({
    s3: r2Client,
    bucket: R2_BUCKET,
    key: (req, file, cb) => {
      const userId = req.params.id;
      const timestamp = Date.now();
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `profile-photos/profile-${userId}-${timestamp}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Signed contract upload → signed-contracts/ prefix
export const signedContractUpload = multer({
  storage: multerS3({
    s3: r2Client,
    bucket: R2_BUCKET,
    key: (req, file, cb) => {
      const timestamp = Date.now();
      cb(null, `signed-contracts/${timestamp}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB for PDFs
});
```

### 4.4 Create `backend/utils/r2Delete.js`

```js
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, R2_BUCKET } from '../config/r2.js';

// key = the R2 object key (e.g., "signed-contracts/1234567890-file.pdf")
export const deleteFromR2 = async (key) => {
  if (!key) return;
  try {
    await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  } catch (err) {
    console.error('R2 delete error:', err.message);
  }
};
```

### 4.5 Update `backend/routes/users.js`

Find the two multer configurations (`storage` with `diskStorage`) and replace them:

**Remove:**
```js
import multer from 'multer';
import fs from 'fs';
// ... the diskStorage config and upload/profileUpload multer instances
```

**Add at the top:**
```js
import { documentUpload, profilePhotoUpload } from '../utils/r2Upload.js';
import { deleteFromR2 } from '../utils/r2Delete.js';
import { R2_PUBLIC_URL } from '../config/r2.js';
```

For any route that saves a file path like:
```js
// OLD
user.profilePhoto = req.file.path;

// NEW — req.file.location is the full S3/R2 URL when using multer-s3
user.profilePhoto = req.file.location;
// OR store just the key for later deletion:
user.profilePhotoKey = req.file.key;
```

For serving profile photos, since they now have a public R2 URL, you no longer need `express.static`. The URL stored in `user.profilePhoto` is already a public link.

Update the Contract model's `signedContractFile` schema to store `key` and `url` instead of `path`:

```js
signedContractFile: {
  filename: String,
  originalName: String,
  key: String,   // R2 object key for deletion
  url: String,   // Public URL for download
},
```

### 4.6 Update `backend/routes/contracts.js` — Signed Contract Upload

Replace disk-based multer with:
```js
import { signedContractUpload } from '../utils/r2Upload.js';
import { deleteFromR2 } from '../utils/r2Delete.js';
```

For the upload route (currently uses `req.file.path`):
```js
// OLD
contract.signedContractFile = {
  filename: req.file.filename,
  originalName: req.file.originalname,
  path: req.file.path,
};

// NEW
contract.signedContractFile = {
  filename: req.file.key,
  originalName: req.file.originalname,
  key: req.file.key,
  url: req.file.location,
};
```

For the download route (currently uses `res.download(path)`):
```js
// OLD
res.download(contract.signedContractFile.path, ...);

// NEW — redirect to the R2 public URL
res.redirect(contract.signedContractFile.url);
```

For deletion before re-upload:
```js
// OLD
fs.unlinkSync(contract.signedContractFile.path);

// NEW
await deleteFromR2(contract.signedContractFile.key);
```

### 4.7 Update `backend/routes/contracts.js` — PDF Generation (pdflatex)

The generated PDF is currently built in `backend/temp/`, sent as a download stream, then deleted. This can stay on the Render filesystem (ephemeral temp is fine since the file is deleted immediately after sending). **No R2 changes needed for on-the-fly generation.** However, Render must have `pdflatex` available — see Phase 5.

### 4.8 Update `backend/database.js`

```js
import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Atlas Connected Successfully');
  } catch (error) {
    console.error('MongoDB Connection Error:', error);
    process.exit(1);
  }
};

export default connectDB;
```

### 4.9 Update `backend/server.js` CORS Origins

```js
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,           // e.g. https://cgen.pages.dev or your GH Pages URL
    'http://localhost:3001',            // local dev
  ],
  credentials: true,
}));
```

Remove the `app.use('/uploads', express.static('uploads'))` line — no longer needed.

### 4.10 Update `backend/utils/getLocalIP.js`

This utility is only used for LAN discovery console logs. On Render it will return the container's internal IP, which is harmless but irrelevant. No change required, but you can guard it:

```js
// In server.js, change the console.log block to:
console.log(`Backend running on port ${PORT}`);
```

> ✅ **Phase 4 Done:** Backend no longer uses local disk for uploads. All files go to and come from R2.

---

## Phase 5 — Render Backend Deployment

**Goal:** Deploy the Express backend on Render with environment variables, pdflatex support, and proper build configuration.

### 5.1 The pdflatex Problem on Render

Render's default Node.js environment **does not include TeX Live / pdflatex**. You have two options:

**Option A (Recommended) — Use a Docker environment on Render:**

Create `backend/Dockerfile`:

```dockerfile
FROM node:20-slim

# Install TeX Live (minimal, includes pdflatex)
RUN apt-get update && apt-get install -y \
    texlive-latex-base \
    texlive-fonts-recommended \
    texlive-latex-extra \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 5000
CMD ["node", "server.js"]
```

Create `backend/.dockerignore`:
```
node_modules
uploads
temp
.env
```

On Render: New Web Service → **Docker** environment → point to `backend/Dockerfile`.

**Option B — Use a build script (if Docker is not available on your Render plan):**

Render allows a custom build command. Add to `backend/package.json`:
```json
"scripts": {
  "build": "apt-get install -y texlive-latex-base texlive-fonts-recommended || true",
  "start": "node server.js"
}
```

> Note: apt-get in a build script only works on Render's native environment if the plan allows it. Docker (Option A) is more reliable.

### 5.2 Create the Render Web Service

1. Go to [render.com](https://render.com) → **New** → **Web Service**.
2. Connect your GitHub repo.
3. Settings:
   - **Root Directory:** `backend`
   - **Environment:** Docker (if using Option A) or Node
   - **Build Command:** `npm ci` (or leave empty for Docker)
   - **Start Command:** `node server.js`
   - **Region:** Singapore (closest to PH)

### 5.3 Set Environment Variables on Render

In your Render service → **Environment** → add all variables:

```
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/contract_management?retryWrites=true&w=majority
JWT_SECRET=<generate a long random string>
FRONTEND_URL=https://YOUR_FRONTEND_URL

R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_BUCKET_NAME=cgen-uploads
R2_PUBLIC_URL=https://pub-xxxxxxxxx.r2.dev
```

Generate a JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 5.4 Add `backend/.env` Loading

Make sure `backend/server.js` (or at minimum `backend/database.js`) loads dotenv at the top:

```js
import 'dotenv/config';
```

And ensure `dotenv` is in `backend/package.json` dependencies (it already is).

### 5.5 Create `backend/render.yaml` (optional, for Infrastructure-as-Code)

```yaml
services:
  - type: web
    name: cgen-backend
    env: docker
    dockerfilePath: ./backend/Dockerfile
    region: singapore
    plan: free
    envVars:
      - key: MONGODB_URI
        sync: false
      - key: JWT_SECRET
        sync: false
      - key: R2_ACCOUNT_ID
        sync: false
      - key: R2_ACCESS_KEY_ID
        sync: false
      - key: R2_SECRET_ACCESS_KEY
        sync: false
      - key: R2_BUCKET_NAME
        value: cgen-uploads
      - key: R2_PUBLIC_URL
        sync: false
      - key: FRONTEND_URL
        sync: false
```

### 5.6 Verify the Backend Health Endpoint

After deployment, visit:
```
https://your-render-service.onrender.com/api/health
```

Expected response:
```json
{ "status": "OK", "message": "Server is running" }
```

> ✅ **Phase 5 Done:** Backend is live on Render, connected to Atlas and R2.

---

## Phase 6 — Frontend Deployment

**Goal:** Build the React/Vite frontend and deploy it so it can reach the Render backend.

### 6.1 Update `frontend/vite.config.js` for Production

The proxy only works in dev mode. For production builds, the frontend must call the backend by its full URL using an env variable:

Update any hardcoded `http://localhost:5000` or `/api` calls in the frontend source to use:

```js
const API_BASE = import.meta.env.VITE_API_URL || '';
// Usage: `${API_BASE}/api/contracts`
```

Search for all API calls in your components:
```bash
grep -r "localhost:5000\|\/api\/" frontend/src/
```

Replace each with the env-variable pattern above.

### 6.2 Option A — Render Static Site (Simplest, Same Platform)

1. Render → **New** → **Static Site**.
2. Root directory: `frontend`
3. Build command: `npm ci && npm run build`
4. Publish directory: `dist`
5. Add environment variable:
   ```
   VITE_API_URL=https://your-render-backend.onrender.com
   ```
6. Add a rewrite rule for SPA routing:
   - Source: `/*`
   - Destination: `/index.html`

### 6.3 Option B — GitHub Pages

1. Install `gh-pages`:
   ```bash
   cd frontend
   npm install --save-dev gh-pages
   ```
2. Add to `frontend/package.json`:
   ```json
   "homepage": "https://YOUR_USERNAME.github.io/cgen",
   "scripts": {
     "deploy": "npm run build && gh-pages -d dist"
   }
   ```
3. Add `frontend/.env.production`:
   ```
   VITE_API_URL=https://your-render-backend.onrender.com
   ```
4. Deploy:
   ```bash
   npm run deploy
   ```
5. In your GitHub repo → Settings → Pages → Source: `gh-pages` branch.

> **Recommendation:** Use Render Static Site — same platform, simpler CORS, no separate deploy step, automatic SSL.

> ✅ **Phase 6 Done:** Frontend is live and talking to the Render backend.

---

## Phase 7 — Data Integrity Verification

**Goal:** Confirm all existing data and files are accessible after migration.

### 7.1 MongoDB Data Verification Checklist

Run these queries in Atlas's Query interface or via mongosh:

```js
// Count records in each collection — compare with local counts
db.users.countDocuments()
db.contracts.countDocuments()
db.positions.countDocuments()
db.salaryGrades.countDocuments()
db.signatories.countDocuments()
db.holidays.countDocuments()
db.notifications.countDocuments()
db.changeLogs.countDocuments()
db.eodb_print_logs.countDocuments()
```

### 7.2 Update Stored File Paths → R2 URLs

After migrating uploads to R2, documents stored in MongoDB still have the old local `path` like `uploads/profile-123-456.jpg`. You need a one-time migration script to update those to R2 URLs.

Create `backend/scripts/migrateFilePaths.js`:

```js
import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Contract from '../models/Contract.js';

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

await mongoose.connect(process.env.MONGODB_URI);

// Migrate user profile photos
const users = await User.find({ profilePhoto: { $exists: true, $ne: null } });
for (const user of users) {
  if (user.profilePhoto && !user.profilePhoto.startsWith('http')) {
    const filename = user.profilePhoto.replace(/^uploads\//, '');
    user.profilePhoto = `${R2_PUBLIC_URL}/profile-photos/${filename}`;
    await user.save();
    console.log(`Updated user ${user._id} profilePhoto`);
  }
}

// Migrate user documents
const usersWithDocs = await User.find({ 'documents.0': { $exists: true } });
for (const user of usersWithDocs) {
  let changed = false;
  for (const doc of user.documents) {
    if (doc.path && !doc.path.startsWith('http')) {
      const filename = doc.path.replace(/^uploads\//, '');
      doc.url = `${R2_PUBLIC_URL}/documents/${filename}`;
      doc.key = `documents/${filename}`;
      changed = true;
    }
  }
  if (changed) {
    await user.save();
    console.log(`Updated documents for user ${user._id}`);
  }
}

// Migrate signed contracts
const contracts = await Contract.find({ 'signedContractFile.path': { $exists: true } });
for (const contract of contracts) {
  if (contract.signedContractFile?.path && !contract.signedContractFile.path.startsWith('http')) {
    const filename = contract.signedContractFile.path.replace(/^uploads\/signed-contracts\//, '');
    contract.signedContractFile.url = `${R2_PUBLIC_URL}/signed-contracts/${filename}`;
    contract.signedContractFile.key = `signed-contracts/${filename}`;
    await contract.save();
    console.log(`Updated contract ${contract._id} signedContractFile`);
  }
}

console.log('Migration complete.');
await mongoose.disconnect();
```

Run it once:
```bash
cd backend
node scripts/migrateFilePaths.js
```

### 7.3 Smoke Test Checklist

After deployment, manually verify each of these:

- [ ] Login with existing admin credentials works
- [ ] User list loads with profile photos displaying correctly
- [ ] A contract can be generated (PDF download works — pdflatex is working)
- [ ] A signed contract PDF can be uploaded
- [ ] A signed contract PDF can be downloaded
- [ ] User document upload works
- [ ] Profile photo upload and display works
- [ ] EODB generation works
- [ ] Contract expiry notifications are triggering (check cron logs on Render)
- [ ] Activity logs are being written

> ✅ **Phase 7 Done:** All data and files verified. System is fully operational in the cloud.

---

## Phase 8 — Production Hardening

**Goal:** Lock down the deployment for real-world use before going live.

### 8.1 JWT Secret

Ensure `JWT_SECRET` in Render env is at least 64 characters of random data (generated in Phase 5.3). Never use the dev default.

### 8.2 Change Default Admin Password

Immediately after first login, go to the admin user settings and change the password from `admin123`.

### 8.3 MongoDB Atlas — Tighten Network Access

Instead of `0.0.0.0/0`, whitelist Render's outbound IPs. Render publishes their IP ranges — check [render.com/docs](https://render.com/docs) for the current list. Or, if using Render Pro, use a Static Outbound IP feature.

### 8.4 Cloudflare R2 — CORS Policy

In R2 bucket settings → **CORS Policy**, add:

```json
[
  {
    "AllowedOrigins": ["https://your-frontend-url.com"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

### 8.5 Render — Prevent Cold Starts

Render's free tier spins down after 15 minutes of inactivity. Options:
- Upgrade to Render's **Starter** plan ($7/mo) to keep the service always on.
- Set up a free uptime monitor (e.g., UptimeRobot) to ping `/api/health` every 10 minutes.

### 8.6 Set Up Render Auto-Deploy

In Render → your service → **Settings** → Auto-Deploy: **Yes**. Every push to `main` on GitHub will trigger a new deployment automatically.

### 8.7 Environment Variable for `temp/` Directory

On Render, the filesystem is ephemeral but writable. The `temp/` directory used by pdflatex will work as-is. Ensure the path is resolved relative to `process.cwd()` (it already is in the contracts route). No change needed.

> ✅ **Phase 8 Done:** System is production-ready.

---

## Quick Reference — Final Environment Variables

### Render Backend

| Variable | Value |
|---|---|
| `PORT` | `5000` |
| `MONGODB_URI` | Atlas connection string |
| `JWT_SECRET` | 64-char random string |
| `FRONTEND_URL` | Your frontend URL |
| `R2_ACCOUNT_ID` | Cloudflare Account ID |
| `R2_ACCESS_KEY_ID` | R2 Token Access Key |
| `R2_SECRET_ACCESS_KEY` | R2 Token Secret |
| `R2_BUCKET_NAME` | `cgen-uploads` |
| `R2_PUBLIC_URL` | `https://pub-xxx.r2.dev` |

### Frontend (Build-time)

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://your-backend.onrender.com` |

---

## Summary of All Phases

| Phase | What You Do | Outcome |
|---|---|---|
| 1 | GitHub repo, .gitignore, push code | Source on GitHub |
| 2 | Atlas cluster, mongodump/restore | DB in cloud |
| 3 | R2 bucket, API token, aws s3 cp | Files in R2 |
| 4 | Code changes: multer-s3, R2 config, schema | Backend speaks R2 |
| 5 | Render Docker deploy, env vars, pdflatex | Backend live |
| 6 | Frontend build, Render Static Site | Frontend live |
| 7 | Path migration script, smoke tests | Data integrity confirmed |
| 8 | JWT, CORS, cold starts, auto-deploy | Production hardened |

---

*Generated for CGEN — Contract Management System · June 2026*
