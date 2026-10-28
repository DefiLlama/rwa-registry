/**
 * codeLists: the server's code lists that move into data, copied once from defillama-server defi/src/rwa at 637d9bfa8.
 * @dev review: src/import/applyCodeLists.ts
 */
import type { AddressFamily } from '../schema';

// The server's display name of each chain, by chain slug: rwaChainLabel of its export spelling, or getChainDisplayName
// of its sdk key where the spelling is no DefiLlama id (acala-evm, astar-zk-evm, cronos-zk-evm, plume, story).
// A merged spelling takes its row's label.
export const CHAIN_LABELS: Record<string, string> = {
  '0g': '0G',
  '5ire': '5ire',
  abstract: 'Abstract',
  'acala-evm': 'Acala',
  adi: 'ADI',
  agoric: 'Agoric',
  airdao: 'AirDAO',
  algorand: 'Algorand',
  althea: 'Althea',
  ancient8: 'Ancient8',
  'aonea-v-chain': 'Aonea-V-Chain',
  aptos: 'Aptos',
  arbitrum: 'Arbitrum',
  'arbitrum-nova': 'Arbitrum Nova',
  arc: 'Arc',
  archway: 'Archway',
  artela: 'Artela',
  astar: 'Astar',
  'astar-zk-evm': 'Astar zkEVM',
  aster: 'Aster',
  aura: 'Aura Network',
  aurora: 'Aurora',
  avax: 'Avalanche',
  axelar: 'Axelar',
  b3: 'B3',
  base: 'Base',
  berachain: 'Berachain',
  bevm: 'BEVM',
  bfc: 'Bifrost Network',
  bitlayer: 'Bitlayer',
  bittorrent: 'Bittorrent',
  blast: 'Blast',
  bob: 'BOB',
  boba: 'Boba',
  'boba-avax': 'Boba_Avax',
  'boba-bnb': 'Boba_Bnb',
  'boba-moonbeam': 'Boba_moonbeam',
  botanix: 'Botanix',
  bsc: 'BSC',
  bsquared: 'BSquared',
  canto: 'Canto',
  carbon: 'Carbon',
  celo: 'Celo',
  chihuahua: 'Chihuahua',
  chiliz: 'Chiliz',
  comdex: 'Comdex',
  conflux: 'Conflux',
  core: 'CORE',
  crescent: 'Crescent',
  cronos: 'Cronos',
  'cronos-zk-evm': 'Cronos zkEVM',
  crossfi: 'CrossFi',
  degen: 'Degen',
  dogechain: 'Dogechain',
  dymension: 'Dymension',
  elys: 'Elys',
  eon: 'Horizen EON',
  era: 'ZKsync Era',
  ethereum: 'Ethereum',
  ethpow: 'EthereumPoW',
  etlk: 'Etherlink',
  europa: 'SKALE Europa',
  evmos: 'Evmos',
  exsat: 'exSat',
  fantom: 'Fantom',
  filecoin: 'Filecoin',
  flare: 'Flare',
  fraxtal: 'Fraxtal',
  fuse: 'Fuse',
  gatelayer: 'GateLayer',
  'godwoken-v1': 'GodwokenV1',
  gravity: 'Gravity by Galxe',
  harmony: 'Harmony',
  hedera: 'Hedera',
  hemi: 'Hemi',
  hsk: 'HSK Chain',
  hyperliquid: 'Hyperliquid L1',
  ibc: 'Ibc',
  icp: 'ICP',
  imx: 'Immutable zkEVM',
  ink: 'Ink',
  intain: 'Intain',
  iotaevm: 'IOTA EVM',
  iotex: 'IoTeX',
  iris: 'IRISnet',
  islm: 'HAQQ',
  juno: 'Juno',
  katana: 'Katana',
  kava: 'Kava',
  kinesis: 'Kinesis',
  klaytn: 'Kaia',
  kroma: 'Kroma',
  kujira: 'Kujira',
  lens: 'Lens',
  'lightlink-phoenix': 'LightLink',
  linea: 'Linea',
  lisk: 'Lisk',
  loopring: 'Loopring',
  lyra: 'Derive Chain',
  manta: 'Manta',
  mantle: 'Mantle',
  map: 'MAP Protocol',
  megaeth: 'MegaETH',
  metis: 'Metis',
  milkomeda: 'Milkomeda C1',
  'milkomeda-a1': 'Milkomeda A1',
  mode: 'Mode',
  monad: 'Monad',
  moonbeam: 'Moonbeam',
  moonriver: 'Moonriver',
  morph: 'Morph',
  neo: 'NEO',
  neutron: 'Neutron',
  nibiru: 'Nibiru',
  noble: 'Noble',
  oasis: 'Oasis Emerald',
  occ: 'EDU Chain',
  okexchain: 'OKTChain',
  optimism: 'OP Mainnet',
  osmosis: 'Osmosis',
  peaq: 'Peaq',
  persistence: 'Persistence One',
  pharos: 'Pharos',
  plasma: 'Plasma',
  plume: 'Plume Mainnet',
  polygon: 'Polygon',
  'polygon-zkevm': 'Polygon zkEVM',
  provenance: 'Provenance',
  pulse: 'PulseChain',
  q: 'Q Protocol',
  regen: 'Regen',
  ripple: 'XRPL',
  rise: 'RISE',
  robinhood: 'Robinhood Chain',
  ronin: 'Ronin',
  rsk: 'Rootstock',
  sapphire: 'Oasis Sapphire',
  scroll: 'Scroll',
  secret: 'Secret',
  sei: 'Sei',
  sifchain: 'Sifchain',
  'silicon-zk': 'Silicon zkEVM',
  smartbch: 'smartBCH',
  solana: 'Solana',
  soneium: 'Soneium',
  sonic: 'Sonic',
  sophon: 'Sophon',
  stable: 'Stable',
  stargaze: 'Stargaze',
  starknet: 'Starknet',
  stellar: 'Stellar',
  story: 'Data Network',
  strato: 'Strato Chain',
  sui: 'Sui',
  tac: 'TAC',
  taiko: 'Taiko',
  telos: 'Telos',
  tempo: 'Tempo',
  theta: 'Theta',
  ton: 'TON',
  tron: 'Tron',
  ultron: 'Ultron',
  umee: 'UX',
  unichain: 'Unichain',
  velas: 'Velas',
  wc: 'World Chain',
  wemix: 'WEMIX3.0',
  xdai: 'Gnosis',
  xdc: 'XDC',
  xlayer: 'X Layer',
  xpla: 'XPLA',
  xrplevm: 'XRPL EVM',
  zeta: 'ZetaChain',
  zircuit: 'Zircuit',
  zora: 'Zora',
};

// The server's INDEXER_CHAIN_IDS by chain slug; hyperliquid (999) is HyperEVM, zksync_era is era.
export const CHAIN_CAIP2: Record<string, string> = {
  arbitrum: 'eip155:42161',
  'arbitrum-nova': 'eip155:42170',
  avax: 'eip155:43114',
  base: 'eip155:8453',
  berachain: 'eip155:80094',
  blast: 'eip155:81457',
  bsc: 'eip155:56',
  era: 'eip155:324',
  ethereum: 'eip155:1',
  hyperliquid: 'eip155:999',
  linea: 'eip155:59144',
  megaeth: 'eip155:4326',
  mode: 'eip155:34443',
  monad: 'eip155:143',
  optimism: 'eip155:10',
  polygon: 'eip155:137',
  'polygon-zkevm': 'eip155:1101',
  scroll: 'eip155:534352',
  soneium: 'eip155:1868',
  sonic: 'eip155:146',
  unichain: 'eip155:130',
  xdai: 'eip155:100',
  xlayer: 'eip155:196',
};

// Two spellings of one chain: the export writes both, and the row keeps the chain key the server's sdk and
// normalizeChain use (avax, xdai, klaytn, etlk, hyperliquid for HyperEVM, ripple, bsc, berachain, era); the other
// stays as its alias. The export's zksync items are ZKsync Era addresses (USDT 0x4932…, USDC 0x3355…), not ZKsync Lite.
// b2-mainnet is B² Network, which the sdk keys bsquared (chainId 223, rpc b2-mainnet.alt.technology).
export const CHAIN_MERGES: Record<string, string> = {
  avalanche: 'avax',
  gnosis: 'xdai',
  kaia: 'klaytn',
  etherlink: 'etlk',
  hyperevm: 'hyperliquid',
  xrpl: 'ripple',
  bnb: 'bsc',
  bera: 'berachain',
  zksync: 'era',
  'zksync-era': 'era',
  'b2-mainnet': 'bsquared',
};

// The chains the stablecoins feed names and no export contract does, by the sdk key the row takes as its slug, so a
// feed's chain name reaches a row and the server's display name (normalizeChain at 637d9bfa8, providers.json chainId).
export const FEED_CHAINS: string[] = ['gravity', 'imx', 'iotaevm', 'occ'];

// The chains in neither DefiLlama's chain list (normalizeChain at 637d9bfa8) nor the sdk's providers.json. Each stays a
// row labelled with the server's rwaChainLabel of the sheet's spelling, which is what live publishes, and the calls
// list names them for a person to give them a page or merge them.
export const UNLISTED_CHAINS: string[] = ['aonea-v-chain', 'boba-moonbeam'];

// The sdk chain key of a chain whose slug and aliases do not name it, matched on the chain id in the sdk's providers.json.
export const CHAIN_SDK_KEYS: Record<string, string> = {
  'acala-evm': 'acala',
  'astar-zk-evm': 'astrzk',
  bitlayer: 'btr',
  botanix: 'btnx',
  chiliz: 'chz',
  'cronos-zk-evm': 'cronos_zkevm',
  exsat: 'xsat',
  story: 'sty',
};

// The server's PEGGED_UNRELEASED_BY_CG (atvlRefill.ts at 637d9bfa8): an issuer reserve the stablecoins feed already
// leaves out of circulating, so on an override chain it is not subtracted a second time. The label kind carries it.
export const RESERVE_UNRELEASED_BY_CG: Record<string, Record<string, string[]>> = {
  'stasis-eurs': { ethereum: ['0x1bee4f735062cd00841d6997964f187f5f5f5ac9'] },
  tether: { ethereum: ['0x5754284f345afc66a98fbb0a0afe71e0f007b949'] },
  'tether-eurt': { ethereum: ['0x5754284f345afc66a98fbb0a0afe71e0f007b949'] },
  'usd-coin': { ethereum: ['0x55fe002aeff02f77364de339a1292923a15844b8'] },
};

// The server's RWA_STABLECOIN_* and RWA_GOVERNANCE_* labels; a category also counts when its label holds the word.
export const STABLECOIN_LABELS = {
  category: ['Fiat-Backed Stablecoins', 'Stablecoins backed by RWAs', 'Non-RWA Stablecoins'],
  'asset-class': [
    'USD fiat stablecoin',
    'Synthetic backed stablecoin',
    'Crypto-collateralized stablecoin (non-RWA)',
    'Hybrid / multi-asset RWA stablecoin',
    'Yield-bearing RWA stablecoin',
    'Stablecoin yield wrapper',
    'Other fiat stablecoin',
    'EUR fiat stablecoin',
    'Algorithmic / undercollateralized stablecoin',
    'RWA-backed fiat stablecoin (non-yielding)',
    'Yield-bearing fiat stablecoin',
    'Bank deposit token',
  ],
  'rwa-classification': [],
};
export const GOVERNANCE_LABELS = {
  category: ['Governance & Protocol Tokens'],
  'asset-class': ['Governance / voting token (RWA protocol)', 'Revenue / fee share token (RWA protocol)'],
  'rwa-classification': ['Non-RWA (Gov/Utility)'],
};

// The server's REVENUE_ESTIMATE_CONFIDENCE.
export const ESTIMATE_REVENUE_LABELS = ['Issuer-Disclosed', 'Public Filings'];

// The server's FOREX_CODES.
// prettier-ignore
export const FOREX_CODES = [
  'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'NOK', 'SEK', 'DKK', 'SGD', 'HKD', 'CNY', 'CNH', 'MXN',
  'ZAR', 'TRY', 'PLN', 'CZK', 'HUF', 'INR', 'BRL', 'KRW', 'TWD', 'THB',
];

// The server's CRYPTO_TICKERS.
// prettier-ignore
export const CRYPTO_TICKERS = [
  'BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'ADA', 'AVAX', 'DOT', 'MATIC', 'LINK', 'UNI', 'AAVE', 'COMP', 'MKR', 'SNX',
  'CRV', 'SUSHI', 'YFI', 'LDO', 'ARB', 'OP', 'APT', 'SUI', 'SEI', 'TIA', 'NEAR', 'ATOM', 'FTM', 'INJ', 'STX',
  'PEPE', 'SHIB', 'WIF', 'BONK', 'FLOKI', 'MEME', 'WLD', 'JUP', 'JTO', 'PYTH', 'RNDR', 'FIL', 'GRT', 'IMX',
  'MANA', 'SAND', 'AXS', 'APE', 'LTC', 'BCH', 'ETC', 'XLM', 'ALGO', 'HBAR', 'VET', 'EGLD', 'FLR', 'BNB', 'TON',
  'TRX', 'LEO', 'OKB', 'CRO', 'RUNE', 'GALA', 'ENS', 'EOS', 'XTZ', 'THETA', 'NEO', 'WAVES', 'ZEC', 'DASH',
  'IOTA', 'XMR', 'LUNC', 'KAVA', 'CFX', 'BLUR', 'STRK', 'ZK', 'W', 'ETHFI', 'ENA', 'PENDLE', 'EIGEN', 'MOVE',
  'HYPE', 'VIRTUAL', 'AI16Z', 'FARTCOIN', 'TRUMP', 'MELANIA', 'TAO', 'RENDER', 'FET', 'AGIX', 'OCEAN', 'TURBO',
  'WEN', 'MEW', 'POPCAT', 'NEIRO', 'PURR', 'DEEP', 'BERA', 'IP', 'KAITO', 'TST', 'VINE', 'ANIME', 'LAYER3',
  'NIL', 'PARTI', 'ONDO', 'MANTRA', 'OM', 'PUMP', '1000PEPE', '1000BONK', '1000SHIB', '1000FLOKI', '1000LUNC',
  '1000SATS', '1000RATS', '1000CAT', '1000CHEEMS', '1000XEC', '1000BTT', '1000TURBO', '1000TOSHI', '1000TAG',
  '1000WHY', '1000X', '1000NEIROCTO', '10000SATS', '10000NEX', '1000000MOG', '1000000BOB', '1000000BABYDOGE',
];

// The server's ONCHAIN_MCAP_EQUALS_ACTIVE_PLATFORMS, matched on the platform name without case.
export const ONCHAIN_MCAP_EQUALS_ACTIVE_PLATFORMS = ['xStocks', 'xStock', 'Backed Finance', 'Backed', 'Backed Fi'];

export interface CodeAck {
  legacyId: number;
  guard: 'flows-hidden' | 'asset-move';
  slugSuffix: string;
  from: string;
  reason: string;
  resolve: string;
}

const DROP_TO_ZERO_RESOLVE =
  'remove when the asset is priced again; the mute covers only a drop under 1000 USD from at least 100k USD (DROP_TO_ZERO, assetMoveAcks.ts:57)';
// The shallow server clone dates every line 2026-09-03, so an undated entry is in code on or before that day.
const assetMove = (legacyId: number, reason: string, from = '2026-09-03'): CodeAck => ({
  legacyId,
  guard: 'asset-move',
  slugSuffix: 'asset-move',
  from,
  reason,
  resolve: DROP_TO_ZERO_RESOLVE,
});

// The server's FLOWS_HIDDEN_IDS and RWA_ASSET_MOVE_ACKS.
export const CODE_ACKS: CodeAck[] = [
  {
    legacyId: 609,
    guard: 'flows-hidden',
    slugSuffix: 'flows',
    from: '2026-09-03',
    reason: 'BRZ phantom mcap, about 1e17 spikes, hidden from flows per asset and in the aggregates',
    resolve: 'drop when the stablecoins API mcap for BRZ is sane',
  },
  assetMove(94, 'FIUSD price-feed gap; blocked correctly, value frozen.'),
  assetMove(278, 'bERNX (Backed) price-feed gap; a Backed equity to ~$0 is a feed dropout.'),
  assetMove(
    3168,
    'PALLx (Backed palladium xStock): Backed NAV null + no liquid pool, so xstocks.ts has no seed price → dropout. No honest source until Backed publishes NAV or a pool forms.',
  ),
  assetMove(387, 'mUSD ($1 peg) price-feed gap; a peg to ~$0 is always a dropout.'),
  assetMove(433, 'USD+ ($1 peg) price-feed gap.'),
  assetMove(4048, 'flUSD ($1 peg) price-feed gap.'),
  assetMove(
    139,
    'NOTE (Republic Note): CG-only source ($0.043, ~$2k/day vol) whose last_updated routinely lags >6h, so coins stale-deletes it → zeroes mcap; no on-chain liquidity. Self-heals when CG refreshes.',
  ),
  assetMove(441, 'USFR.d Dinari dShare: no fills >14d (MAX_FILL_AGE) → unpriced by design.'),
  assetMove(
    2721,
    'MNRL (Plume): alive on-chain, no live price source → recurring feed-zero; block keeps last-good.',
    '2026-07-23',
  ),
  assetMove(
    2976,
    'REALU (Aktionariat): under CHF10k buy-depth liquidity filter → unpriced; recurring drop-to-$0.',
    '2026-07-23',
  ),
  assetMove(
    2984,
    'VIDS (Aktionariat): verified genuinely illiquid (getLiquidity 0 on every field); recurring drop-to-$0.',
    '2026-07-23',
  ),
  assetMove(
    4064,
    'PC188814458 (Tradable, zksync): phantom eth leg → recurring drop-to-$0; block keeps last-good.',
    '2026-07-23',
  ),
];
