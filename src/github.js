import { parseGithubUrl, truncate } from "./util.js";

const API = "https://api.github.com";

function headers() {
  const value = {
    Accept: "application/vnd.github+json",
    "User-Agent": "vulture-review-desk",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    value.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return value;
}

async function githubFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...headers(), ...(options.headers ?? {}) },
    signal: AbortSignal.timeout(20000),
  });

  if (response.status === 404) {
    throw new Error("The repository was not found. Check the link, or make sure the repo is public.");
  }
  if (response.status === 403 || response.status === 429) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (remaining === "0") {
      throw new Error("GitHub's API rate limit was reached. Add a GITHUB_TOKEN on the server to raise the limit.");
    }
    throw new Error("GitHub refused the request. It may be private, or the API rate limit was reached.");
  }
  if (!response.ok) {
    throw new Error(`GitHub returned status ${response.status}.`);
  }
  return response;
}

export async function fetchGithubEvidence(value) {
  const parsed = parseGithubUrl(value);
  if (!parsed) {
    throw new Error("Enter a full GitHub repository URL, for example https://github.com/owner/repo.");
  }

  const repoResponse = await githubFetch(`${API}/repos/${parsed.owner}/${parsed.repo}`);
  const repo = await repoResponse.json();
  const branch = repo.default_branch || "main";
  const warnings = [];

  const readmePromise = githubFetch(`${API}/repos/${parsed.owner}/${parsed.repo}/readme`, {
    headers: { Accept: "application/vnd.github.raw+json" },
  })
    .then((response) => response.text())
    .catch(() => {
      warnings.push("No README was found at the repository root.");
      return "";
    });

  const treePromise = githubFetch(
    `${API}/repos/${parsed.owner}/${parsed.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  )
    .then((response) => response.json())
    .catch((error) => {
      warnings.push(`The file tree could not be read: ${error.message}`);
      return { tree: [] };
    });

  const languagesPromise = githubFetch(`${API}/repos/${parsed.owner}/${parsed.repo}/languages`)
    .then((response) => response.json())
    .catch(() => ({}));

  const [readme, tree, languages] = await Promise.all([readmePromise, treePromise, languagesPromise]);
  const files = Array.isArray(tree.tree) ? tree.tree.filter((item) => item.type === "blob") : [];
  const paths = files.map((item) => item.path);
  const lowerPaths = paths.map((path) => path.toLowerCase());
  const codeExtensions = /\.(py|ipynb|js|jsx|ts|tsx|java|cpp|c|h|go|rs|rb|php|sql|r|m|swift|kt)$/i;
  const modelExtensions = /\.(pt|pth|onnx|h5|keras|pkl|joblib|safetensors|bin)$/i;
  const testPaths = lowerPaths.filter(
    (path) => /(^|\/)(tests?|__tests__)\//.test(path) || /(^|\/)(test_|.*\.(test|spec)\.)/.test(path),
  );

  const flags = {
    hasReadme: Boolean(readme.trim()),
    hasTests: testPaths.length > 0,
    hasRequirements: lowerPaths.some((path) => /(^|\/)(requirements.*\.txt|pyproject\.toml|environment\.ya?ml|pipfile)$/.test(path)),
    hasPackageJson: lowerPaths.includes("package.json"),
    hasDocker: lowerPaths.some((path) => /(^|\/)dockerfile$/.test(path) || /docker-compose/.test(path)),
    hasCI: lowerPaths.some((path) => path.startsWith(".github/workflows/")),
    hasNotebook: lowerPaths.some((path) => path.endsWith(".ipynb")),
    hasModelFiles: lowerPaths.some((path) => modelExtensions.test(path)),
    codeFileCount: lowerPaths.filter((path) => codeExtensions.test(path)).length,
    testFileCount: testPaths.length,
  };

  if (tree.truncated) warnings.push("GitHub truncated the repository tree; the analysis uses the first batch of files.");

  return {
    repo: {
      fullName: repo.full_name,
      name: repo.name,
      owner: repo.owner?.login ?? parsed.owner,
      htmlUrl: repo.html_url,
      description: repo.description ?? "",
      language: repo.language ?? "",
      stars: repo.stargazers_count ?? 0,
      forks: repo.forks_count ?? 0,
      topics: Array.isArray(repo.topics) ? repo.topics : [],
      defaultBranch: branch,
      pushedAt: repo.pushed_at ?? null,
      license: repo.license?.spdx_id ?? "",
    },
    readme: truncate(readme, 12000),
    files: paths.slice(0, 400),
    fileCount: files.length,
    languages: languages && typeof languages === "object" ? languages : {},
    flags,
    warnings,
  };
}
