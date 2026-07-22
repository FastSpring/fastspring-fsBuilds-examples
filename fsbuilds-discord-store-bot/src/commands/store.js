const path = require('path');
const {
  SlashCommandBuilder,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  MessageFlags,
} = require('discord.js');
const { fetchCatalog, fetchProducts } = require('../fastspring/catalog');
const { buildCheckoutUrl, browseUrl } = require('../fastspring/session');
const {
  STORE_BRANDING,
  VIP_PRODUCTS,
  VIP_UPSELL_PRODUCT,
  FALLBACK_BLURB,
} = require('../presentation');
const { checkVip } = require('../vip');

// Components V2 lets us render one cohesive message where each product is a
// "section" (text + image accessory) with its own buy button directly beneath —
// so the button is unmistakably tied to its product, all in a single message.
//
// Components V2 caps a message at 40 total components; each product card costs
// ~5, so we cap the combined (featured + VIP) card count to stay under it.
const MAX_TOTAL_CARDS = 7;

const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets');

const data = new SlashCommandBuilder()
  .setName('store')
  .setDescription('Browse and purchase in-game items — powered by FastSpring.');

function linkButton(label, url) {
  return new ButtonBuilder().setLabel(label).setEmoji('🛒').setURL(url).setStyle(ButtonStyle.Link);
}

/** Appends a product card (section + image) and its own buy button to a container. */
function appendProduct(container, item, discordUserId, discordUsername) {
  const section = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${item.displayName}\n${item.description || FALLBACK_BLURB}\n**${item.price}**`
      )
    )
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(item.imageUrl || 'attachment://logo.png'));
  container.addSectionComponents(section);
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      linkButton(
        `Buy ${item.displayName} — ${item.price}`,
        buildCheckoutUrl(item.path, discordUserId, discordUsername)
      )
    )
  );
}

/**
 * /store — a single ephemeral Components V2 message: a branded container with a
 * hero banner, promo copy + a "browse the full web shop" button, then one
 * section per featured product (artwork + text) each followed by its own buy
 * button that deep-links into the hosted webshop pre-filled with that product
 * and the player's Discord identity.
 */
async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let catalog;
  try {
    catalog = await fetchCatalog();
  } catch (err) {
    console.error('[/store] Failed to fetch catalog:', err.message);
    return interaction.editReply({ content: '⚠️ The store is temporarily unavailable. Please try again.' });
  }
  if (!catalog.length) {
    return interaction.editReply({ content: 'The store has no items listed right now.' });
  }

  const { id: discordUserId, username: discordUsername } = interaction.user;
  const browse = browseUrl();
  const hero = new AttachmentBuilder(path.join(ASSETS_DIR, STORE_BRANDING.heroFile), { name: 'hero.png' });
  const logo = new AttachmentBuilder(path.join(ASSETS_DIR, STORE_BRANDING.logoFile), { name: 'logo.png' });

  const headerText =
    `# ${STORE_BRANDING.name} — Web Shop\n` +
    `${STORE_BRANDING.tagline}\n\n` +
    `Coin packs, battle passes, and exclusive egg power-ups — plus member deals ` +
    `you won't find in the app.`;

  // The header keeps the hero banner and a clickable "browse" link in its text.
  // NOTE: Components V2 caps a message at 40 total components (every section,
  // text block, thumbnail, button, etc. counts). Each product card costs ~5, so
  // we skip separators and a separate browse button, and cap the combined
  // (featured + VIP) card count to stay safely under the limit.
  const container = new ContainerBuilder()
    .setAccentColor(STORE_BRANDING.color)
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://hero.png').setDescription('Eggblast Arena')
      )
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText))
    // Real link button (masked markdown links don't render in Components V2 text).
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(linkButton('Browse the Full Web Shop', browse))
    )
    .addSeparatorComponents(new SeparatorBuilder()); // divider under the header

  // VIP section FIRST (just under the header), then the general featured items.
  // A user is VIP if their linked FastSpring account has an active subscription
  // OR they hold the configured VIP role (see src/vip.js). VIPs see exclusive
  // items no one else does; everyone else gets a subscribe upsell.
  //
  // NOTE: hiding items here is presentation, not enforcement. For true
  // exclusivity, gate the offer on the FastSpring side (e.g. a subscriber-only
  // product or a targeted coupon) so a non-VIP can't complete the purchase.
  let vipStatus = { vip: false };
  try {
    vipStatus = await checkVip(interaction);
  } catch (err) {
    console.warn('[/store] VIP check failed:', err.message);
  }

  let vipCardsUsed = 0;
  if (vipStatus.vip) {
    let vipItems = await fetchProducts(VIP_PRODUCTS).catch(() => []);
    vipItems = vipItems.slice(0, MAX_TOTAL_CARDS);
    if (vipItems.length) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          '## ⭐ VIP Exclusives\nMembers-only power-ups you won’t find anywhere else — thanks for being a VIP!'
        )
      );
      vipItems.forEach((item) => appendProduct(container, item, discordUserId, discordUsername));
      vipCardsUsed = vipItems.length;
    }
  } else {
    const upsell = (await fetchProducts([VIP_UPSELL_PRODUCT]).catch(() => []))[0];
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        upsell
          ? `## ⭐ Unlock VIP Exclusives\nSubscribe to **${upsell.displayName}** (${upsell.price}) to unlock members-only items.`
          : '## ⭐ Unlock VIP Exclusives\nSubscribe to unlock members-only items.'
      )
    );
    if (upsell) {
      container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
          linkButton(
            `Unlock VIP — ${upsell.displayName} ${upsell.price}`,
            buildCheckoutUrl(upsell.path, discordUserId, discordUsername)
          )
        )
      );
    }
  }

  // Featured items below the VIP section, as their own labelled group. Budget
  // leaves room for both section headings within the 40-component cap: VIPs get
  // the remaining card slots; non-VIPs reserve one slot for the upsell block.
  const budget = vipStatus.vip
    ? Math.max(0, MAX_TOTAL_CARDS - vipCardsUsed)
    : MAX_TOTAL_CARDS - 1;
  const featured = catalog.slice(0, budget);
  if (catalog.length > featured.length) {
    console.warn(`[/store] Showing ${featured.length}/${catalog.length} featured items to stay under the component cap.`);
  }
  if (featured.length) {
    container.addSeparatorComponents(new SeparatorBuilder()); // divider between sections
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## 🛒 Featured Items\nPopular picks available to everyone.')
    );
    featured.forEach((item) => appendProduct(container, item, discordUserId, discordUsername));
  }

  await interaction.editReply({
    components: [container],
    files: [hero, logo],
    flags: MessageFlags.IsComponentsV2,
  });
}

module.exports = { data, execute };
