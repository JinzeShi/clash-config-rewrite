// URL used by url-test / fallback groups.
const HEALTH_CHECK_URL = "http://www.gstatic.com/generate_204";

// Proxy names matching this pattern will be removed.
const EXCLUDE_PATTERN_TEXT = "Traffic|Expire|有效期|剩余";

// Subscription providers used for failover.
const FAILOVER_PROVIDERS = [
  {
    name: "ProviderA",
    url: "https://example.com/subscription-a",
    prefix: "A - ",
  },
  {
    name: "ProviderB",
    url: "https://example.com/subscription-b",
    prefix: "B - ",
  },
];

// Map profile names to rewrite handlers.
const handlers = {
  ProfileA: handleProfileA,
  ProfileB: handleProfileB,
  ProfileServer: handleProfileServer,
};

// Temporary patch container used while building the final config.
const configPatch = {
  proxies: [],
  proxyGroupsBefore: [],
  proxyGroupsAfter: [],
  rules: [],
};

/**
 * Rewrite entry point.
 *
 * @param {object} config Parsed Clash configuration.
 * @param {string} profileName Profile name configured in the application.
 * @returns {object} Rewritten Clash configuration.
 */
function main(config, profileName) {
  resetConfigPatch();
  const handler = handlers[profileName];
  if (!handler) {
    return config;
  }
  handler(config);

  return config;
}

/**
 * Example profile rewrite.
 */
function handleProfileA(config) {
  const proxyGroupName = "Proxy";

  processProxyConfig(config, proxyGroupName);

  // Append custom patches.
  appendConfigPatch(CustomConfigA);
  appendConfigPatch(CustomConfigB);

  setupProxyFailover(config, proxyGroupName);

  applyConfigPatch(config);
}

/**
 * Example profile rewrite with custom defaults.
 */
function handleProfileB(config) {
  const proxyGroupName = "Proxies";

  processProxyConfig(config, proxyGroupName);

  // Move DIRECT to the top of a specific group.
  setDefaultProxy(config, "GroupA", "DIRECT");

  setupProxyFailover(config, proxyGroupName);

  applyConfigPatch(config);
}

/**
 * Example server-side Clash configuration.
 */
function handleProfileServer(config) {
  config["port"] = 7890;
  config["socks-port"] = 7891;
  delete config["mixed-port"];
  delete config["redir-port"];
  delete config["tproxy-port"];

  config["allow-lan"] = true;
  config["external-controller"] = "0.0.0.0:9090";

  config["ipv6"] = false;
  if (config["dns"]) {
    config["dns"]["ipv6"] = false;
  }
}

/**
 * Move a proxy to the first position of a proxy group.
 */
function setDefaultProxy(config, groupName, proxyName) {
  const group = config["proxy-groups"]?.find(
    g => g.name === groupName
  );

  if (!group?.proxies?.includes(proxyName)) {
    return;
  }

  group.proxies = [
    proxyName,
    ...group.proxies.filter(p => p !== proxyName)
  ];
}

/**
 * Remove unwanted proxies and inject supplementary rules.
 */
function processProxyConfig(config, proxyGroupName) {
  const excludePattern = new RegExp(EXCLUDE_PATTERN_TEXT, "i");

  const excludedNames = new Set(
    config.proxies
      .filter(proxy => excludePattern.test(proxy.name))
      .map(proxy => proxy.name)
  );

  config.proxies = config.proxies.filter(
    proxy => !excludedNames.has(proxy.name)
  );

  config["proxy-groups"]?.forEach(group => {
    if (Array.isArray(group.proxies)) {
      group.proxies = group.proxies.filter(
        name => !excludedNames.has(name)
      );
    }
  });

  config.rules.unshift(
    ...SupplementaryRules.map((rule) =>
      rule.replaceAll("${PROXY}", proxyGroupName),
    ),
  );
}

/**
 * Create failover groups backed by external proxy providers.
 */
function setupProxyFailover(config, proxyGroupName) {
  const originGroup = config["proxy-groups"].find(
    (g) => g.name === proxyGroupName,
  );

  if (!originGroup) {
    return;
  }

  originGroup.name = "Main";

  config["proxy-providers"] ??= {};
  const providerNames = [];
  FAILOVER_PROVIDERS.forEach(provider => {
    config["proxy-providers"][provider.name] = {
      type: "http",
      url: provider.url,
      interval: 86400,
      "exclude-filter": `(?i)${EXCLUDE_PATTERN_TEXT}`,
      override: {
        "additional-prefix": provider.prefix,
      },
    };

    providerNames.push(provider.name);
  });

  configPatch.proxyGroupsAfter.push({
    name: "Failover",
    type: "url-test",
    url: HEALTH_CHECK_URL,
    interval: 300,
    lazy: true,
    use: providerNames,
  });

  configPatch.proxyGroupsBefore.unshift({
    name: proxyGroupName,
    type: "fallback",
    url: HEALTH_CHECK_URL,
    interval: 300,
    lazy: true,
    proxies: [
      "Main",
      "Failover",
      "DIRECT",
    ],
  });
}

/**
 * Clear temporary patch data.
 */
function resetConfigPatch() {
  configPatch.proxies.length = 0;
  configPatch.proxyGroupsBefore.length = 0;
  configPatch.proxyGroupsAfter.length = 0;
  configPatch.rules.length = 0;
}

/**
 * Merge a custom patch into the current patch set.
 */
function appendConfigPatch(configToAppend) {
  configPatch.proxies.push(...(configToAppend.proxies ?? []));
  configPatch.proxyGroupsBefore.push(...(configToAppend.proxyGroupsBefore ?? []));
  configPatch.proxyGroupsAfter.push(...(configToAppend.proxyGroupsAfter ?? []));
  configPatch.rules.push(...(configToAppend.rules ?? []));
}

/**
 * Apply all accumulated patches to the Clash configuration.
 */
function applyConfigPatch(config) {
  config.proxies ??= [];
  config["proxy-groups"] ??= [];
  config.rules ??= [];

  config.proxies.unshift(...configPatch.proxies);
  config["proxy-groups"].unshift(...configPatch.proxyGroupsBefore);
  config["proxy-groups"].push(...configPatch.proxyGroupsAfter);
  config.rules.unshift(...configPatch.rules);
}

// Example rule injections.
const SupplementaryRules = [
  "DOMAIN-SUFFIX, example-direct.com, DIRECT",
  "DOMAIN-SUFFIX, example-proxy.com, ${PROXY}",
]

// Example patch structure.
const CustomConfigA = {
  proxies: [],
  proxyGroupsBefore: [],
  proxyGroupsAfter: [],
  rules: [],
};

const CustomConfigB = {
  proxies: [],
  proxyGroupsBefore: [],
  proxyGroupsAfter: [],
  rules: [],
};