import type { StarlingSpendItem } from '../types'

/**
 * Smart tags: what a payment actually was, in finer grain than Starling's
 * categories. "Kings Head" is a pub, "Uber" a taxi but "Uber Eats" a delivery,
 * a £3 café payment at 8am is coffee, and four small payments at one bar in an
 * evening is a round of drinks.
 *
 * Three layers, in order:
 * 1. Names: known chains and name patterns (a big table, below).
 * 2. Context: time of day and amount ("coffee", "lunch", "evening out", "late night").
 * 3. The day: several small food-and-drink payments at one place = drinks (rounds).
 * Starling's own category is the fallback, so every payment gets at least one tag.
 *
 * Pure and local: nothing leaves the device.
 */

export interface TagInfo {
    label: string
    icon: string
}

export const TAGS = {
    // Food and drink
    coffee: { label: 'Coffee', icon: 'fa-mug-hot' },
    pub: { label: 'Pub', icon: 'fa-beer-mug-empty' },
    bar: { label: 'Bar', icon: 'fa-martini-glass' },
    drinks: { label: 'Drinks', icon: 'fa-champagne-glasses' },
    club: { label: 'Club bar', icon: 'fa-people-group' },
    restaurant: { label: 'Restaurant', icon: 'fa-utensils' },
    'fast-food': { label: 'Fast food', icon: 'fa-burger' },
    takeaway: { label: 'Takeaway', icon: 'fa-bowl-food' },
    delivery: { label: 'Delivery', icon: 'fa-motorcycle' },
    bakery: { label: 'Bakery', icon: 'fa-bread-slice' },
    lunch: { label: 'Lunch', icon: 'fa-sun' },
    breakfast: { label: 'Breakfast', icon: 'fa-egg' },
    'evening-out': { label: 'Evening out', icon: 'fa-moon' },
    // Shops
    supermarket: { label: 'Supermarket', icon: 'fa-cart-shopping' },
    convenience: { label: 'Corner shop', icon: 'fa-store' },
    alcohol: { label: 'Off-licence', icon: 'fa-wine-bottle' },
    clothes: { label: 'Clothes', icon: 'fa-shirt' },
    online: { label: 'Online shopping', icon: 'fa-box' },
    tech: { label: 'Tech', icon: 'fa-laptop' },
    home: { label: 'Home & DIY', icon: 'fa-couch' },
    books: { label: 'Books', icon: 'fa-book' },
    gifts: { label: 'Gifts', icon: 'fa-gift' },
    toys: { label: 'Toys', icon: 'fa-puzzle-piece' },
    flowers: { label: 'Flowers', icon: 'fa-seedling' },
    pharmacy: { label: 'Pharmacy', icon: 'fa-prescription-bottle-medical' },
    // Getting about
    taxi: { label: 'Taxi', icon: 'fa-taxi' },
    bus: { label: 'Bus & tram', icon: 'fa-bus' },
    train: { label: 'Train', icon: 'fa-train' },
    flights: { label: 'Flights', icon: 'fa-plane' },
    stay: { label: 'Hotel & stays', icon: 'fa-bed' },
    fuel: { label: 'Fuel', icon: 'fa-gas-pump' },
    parking: { label: 'Parking', icon: 'fa-square-parking' },
    bikes: { label: 'Bikes & scooters', icon: 'fa-person-biking' },
    // Fun
    cinema: { label: 'Cinema', icon: 'fa-film' },
    tickets: { label: 'Tickets & events', icon: 'fa-ticket' },
    gaming: { label: 'Gaming', icon: 'fa-gamepad' },
    betting: { label: 'Betting', icon: 'fa-dice' },
    // Regulars
    subscription: { label: 'Subscription', icon: 'fa-rotate' },
    streaming: { label: 'Streaming', icon: 'fa-tv' },
    music: { label: 'Music', icon: 'fa-music' },
    software: { label: 'Apps & software', icon: 'fa-cloud' },
    phone: { label: 'Phone & broadband', icon: 'fa-wifi' },
    energy: { label: 'Energy', icon: 'fa-bolt' },
    'council-tax': { label: 'Council tax', icon: 'fa-landmark' },
    insurance: { label: 'Insurance', icon: 'fa-shield' },
    rent: { label: 'Rent', icon: 'fa-house' },
    // Body
    gym: { label: 'Gym & fitness', icon: 'fa-dumbbell' },
    supplements: { label: 'Supplements', icon: 'fa-pills' },
    haircut: { label: 'Hair & beauty', icon: 'fa-scissors' },
    health: { label: 'Health', icon: 'fa-stethoscope' },
    // Other
    charity: { label: 'Charity', icon: 'fa-hand-holding-heart' },
    pets: { label: 'Pets', icon: 'fa-paw' },
    cash: { label: 'Cash', icon: 'fa-money-bill' },
    fees: { label: 'Fees', icon: 'fa-file-invoice-dollar' },
    'late-night': { label: 'Late night', icon: 'fa-moon' },
    // Fallbacks from Starling's categories
    groceries: { label: 'Groceries', icon: 'fa-basket-shopping' },
    'eating-out': { label: 'Eating out', icon: 'fa-utensils' },
    shopping: { label: 'Shopping', icon: 'fa-bag-shopping' },
    transport: { label: 'Transport', icon: 'fa-route' },
    bills: { label: 'Bills', icon: 'fa-file-invoice' },
    entertainment: { label: 'Entertainment', icon: 'fa-ticket' },
    holidays: { label: 'Holidays', icon: 'fa-suitcase' },
    'personal-care': { label: 'Personal care', icon: 'fa-pump-soap' },
    family: { label: 'Family', icon: 'fa-people-roof' },
    transfers: { label: 'Transfers', icon: 'fa-money-bill-transfer' },
    other: { label: 'Other', icon: 'fa-receipt' },
} satisfies Record<string, TagInfo>

export type Tag = keyof typeof TAGS

interface Rule {
    tags: Tag[]
    name: RegExp
    /** Only when Starling filed it under one of these. */
    only?: string[]
}

// Order matters only for the main tag: the first rule that matches leads.
// Patterns are tested against the lower-cased merchant name.
const RULES: Rule[] = [
    // Delivery before taxis, so "Uber Eats" never reads as a cab.
    { tags: ['delivery', 'takeaway'], name: /deliveroo|uber\s*eats|just\s*eat|getir|gopuff|beelivery|zapp\b/ },
    { tags: ['takeaway'], name: /domino|papa john|pizza hut delivery|\bkebab|chippy|fish bar|chip shop|takeaway|take away|\bwok\b|noodle bar/ },
    { tags: ['taxi'], name: /\buber\b|\bbolt\b|free\s*now|addison lee|\btaxi|\bcabs?\b|city cabs|central taxis|\bgett\b/, only: ['TRANSPORT', 'HOLIDAYS', 'GENERAL', ''] },
    { tags: ['bus'], name: /lothian|stagecoach|first bus|arriva|\bbus(es)?\b|national express|megabus|citylink|edinburgh trams|\btram|metrolink|\btfl\b|transport for london|oyster/, only: ['TRANSPORT', 'HOLIDAYS', 'GENERAL', ''] },
    { tags: ['train'], name: /trainline|scotrail|lner|avanti|\bgwr\b|great western|crosscountry|northern rail|\brail\b|railway|\btrain|southern|thameslink|caledonian sleeper|eurostar/, only: ['TRANSPORT', 'HOLIDAYS', 'GENERAL', ''] },
    { tags: ['flights'], name: /easyjet|ryanair|british a(irways)?|\bba\.com|jet2|loganair|wizz|klm|lufthansa|emirates|airways|airlines|\bairport/ },
    { tags: ['stay'], name: /airbnb|booking\.com|hotels\.com|expedia|premier inn|travelodge|hilton|marriott|holiday inn|ibis|\bhotel|hostel|\binn\b.*hotel/ },
    { tags: ['parking'], name: /parking|ringgo|paybyphone|\bncp\b|car park|justpark/, only: ['TRANSPORT', 'HOLIDAYS', 'GENERAL', ''] },
    { tags: ['fuel'], name: /\bshell\b|\bbp\b|esso|texaco|\bgulf\b|jet petrol|petrol|\bfuel/, only: ['TRANSPORT', 'HOLIDAYS', 'GENERAL', ''] },
    { tags: ['bikes'], name: /\blime\b|\bforest\b|\bvoi\b|\btier\b|just eat cycles|santander cycles|bike hire/, only: ['TRANSPORT', 'HOLIDAYS', 'GENERAL', ''] },

    // Coffee and bakeries
    { tags: ['coffee'], name: /starbucks|costa|caff[eè] nero|\bnero\b|black sheep|origin coffee|\bcoffee|\bcaf[eé]\b|espresso|roaster|brew lab|barista|kaffe|lowdown|artisan roast|cult espresso|leo'?s beanery|\bbean/ },
    { tags: ['bakery'], name: /greggs|bakery|baker'?s|patisserie|pâtisserie|boulangerie|gail'?s|soderberg|\bbaked\b/ },

    // Pubs, bars, clubs
    { tags: ['pub', 'drinks'], name: /wetherspoon|j ?d ?w|\bspoons\b|brewdog|nicholson|greene king|stonegate|\bpub\b|public house|\btavern|alehouse|ale house|taproom|tap room|\bvaults|\barms\b|\binn\b|(king|queen|duke|prince|saracen|nag|turk|bishop|ship)'?s head|red lion|white hart|royal oak|rose (and|&) crown|\bcrown\b|\bplough\b|\banchor\b|white horse|black bull|wheatsheaf|\bthe (swan|bell|star|globe|mitre|feathers|fox|stag|bull|bear|cock|eagle|ship|oak|lion|hart)\b/, only: ['EATING_OUT', 'LIFESTYLE', 'ENTERTAINMENT', 'GENERAL', ''] },
    { tags: ['bar', 'drinks'], name: /\bbar\b|cocktail|wine bar|bodega|lounge|speakeasy|\bsaloon|brewery|brewing|distillery/, only: ['EATING_OUT', 'LIFESTYLE', 'ENTERTAINMENT'] },
    { tags: ['club', 'drinks'], name: /rugby|\brfc\b|golf club|cricket club|social club|sports club|football club|\bfc\b|bowling club|legion/, only: ['EATING_OUT', 'LIFESTYLE', 'ENTERTAINMENT', 'GENERAL', ''] },

    // Restaurants and fast food
    { tags: ['fast-food'], name: /mcdonald|burger king|\bkfc\b|five guys|subway|wendy'?s|taco bell|popeyes|\btortilla\b|chopstix|\bleon\b|itsu|wasabi|pret|tossed|abokado/ },
    { tags: ['restaurant'], name: /nando|wagamama|pizza express|zizzi|ask italian|dishoom|franco manca|honest burger|byron|tgi|frankie|bella italia|prezzo|\bcote\b|côte|hawksmoor|miller ?& ?carter|toby carvery|harvester|yo!? ?sushi|restaurant|\bgrill\b|kitchen|trattoria|osteria|bistro|brasserie|steakhouse|sushi|ramen|\bthai\b|indian|curry|tandoori|mezze|tapas|pizzeria|diner\b|canteen/ },

    // Groceries
    { tags: ['convenience'], name: /tesco express|sainsbury'?s local|co-?op|\bcoop\b|spar\b|premier\b|londis|nisa|one stop|costcutter|scotmid|\bbudgens|little waitrose|m ?& ?s simply food|\bmetro\b|\bexpress\b|\blocal\b|off licence|corner shop|newsagent|mini ?market|food ?& ?wine/, only: ['GROCERIES', 'SHOPPING', 'LIFESTYLE', 'GENERAL', ''] },
    { tags: ['supermarket'], name: /tesco|sainsbury|asda|morrisons|\baldi\b|\blidl\b|waitrose|marks ?& ?spencer|\bm ?& ?s\b|iceland|ocado|farmfoods|costco|whole foods|planet organic|booths|amazon fresh/, only: ['GROCERIES', 'SHOPPING', 'LIFESTYLE', 'GENERAL', ''] },
    { tags: ['alcohol'], name: /majestic|bargain booze|\bwine\b|off licence|oddbins|laithwaite|whisky|beer hawk/, only: ['GROCERIES', 'SHOPPING', 'LIFESTYLE'] },

    // Subscriptions
    { tags: ['streaming', 'subscription'], name: /netflix|disney|prime video|amazon prime|prime membership|now ?tv|apple tv|paramount|discovery|britbox|itvx|mubi|crunchyroll/ },
    { tags: ['music', 'subscription'], name: /spotify|apple music|amazon music|youtube music|tidal|deezer|soundcloud/ },
    { tags: ['software', 'subscription'], name: /apple\.com|icloud|google (storage|one|play)|youtube premium|microsoft|adobe|dropbox|notion|openai|chatgpt|anthropic|claude|github|1password|audible|kindle unlimited|duolingo|headspace|\bcalm\b|strava|patreon|substack|canva/ },

    // Bills
    { tags: ['phone'], name: /\bee\b|vodafone|\bo2\b|\bthree\b|giffgaff|virgin media|\bsky\b|\bbt\b|plusnet|talktalk|hyperoptic|community fibre|lebara|voxi|smarty|id mobile/, only: ['BILLS_AND_SERVICES', 'PAYMENTS', 'GENERAL', 'HOME', ''] },
    { tags: ['energy'], name: /octopus|british gas|\bedf\b|\bovo\b|scottish power|e\.?on|\bbulb\b|shell energy|utilita|so energy|\bwater\b|scottish water|thames water/, only: ['BILLS_AND_SERVICES', 'PAYMENTS', 'GENERAL', 'HOME', ''] },
    { tags: ['council-tax'], name: /council tax|city of edinburgh council|\bcouncil\b/, only: ['BILLS_AND_SERVICES', 'PAYMENTS', 'GENERAL', 'HOME', ''] },
    { tags: ['insurance'], name: /insurance|aviva|direct line|admiral|churchill|\baxa\b|lv=|hastings|vitality|bupa/, only: ['BILLS_AND_SERVICES', 'PAYMENTS', 'GENERAL', 'HOME', ''] },
    { tags: ['rent'], name: /\brent\b|letting|lettings|landlord|estate agent/, only: ['BILLS_AND_SERVICES', 'PAYMENTS', 'GENERAL', 'HOME', ''] },

    // Shopping
    { tags: ['toys', 'gifts'], name: /\btoys?\b|smyths|hamleys|entertainer|\blego\b|build-a-bear|toy ?shop/ },
    { tags: ['gifts'], name: /card factory|clintons|moonpig|funky pigeon|\bgift|paperchase|notonthehighstreet|etsy/ },
    { tags: ['flowers', 'gifts'], name: /interflora|florist|flowers|\bbloom/ },
    { tags: ['clothes'], name: /uniqlo|\bzara\b|h ?& ?m\b|primark|\bnext\b|asos|jd sports|sports direct|\bgap\b|\bmango\b|\bcos\b|arket|river island|new look|tk ?maxx|schuh|office shoes|nike|adidas|lululemon|gymshark|superdry|fat face|white stuff|boden|uniqlo|clothing|apparel|footwear/ },
    { tags: ['online'], name: /amazon|amzn|ebay|vinted|shein|temu|aliexpress|wish\.com/ },
    { tags: ['tech'], name: /apple store|currys|argos|\bgame\b|cex|scan\.co|very\.co|electronics/ },
    { tags: ['home'], name: /ikea|dunelm|b ?& ?q|screwfix|wickes|homebase|toolstation|the range|wilko|habitat|john lewis|robert dyas|hobbycraft/ },
    { tags: ['books'], name: /waterstones|blackwell|\bbooks?\b|bookshop|foyles|kindle/ },
    { tags: ['pharmacy'], name: /boots|superdrug|pharmacy|chemist|lloyds pharmacy|well pharmacy/ },

    // Fun
    { tags: ['cinema'], name: /cinema|odeon|\bvue\b|cineworld|picturehouse|everyman|showcase|\bimax\b|filmhouse/ },
    { tags: ['tickets'], name: /ticketmaster|see tickets|\bdice\b|eventbrite|skiddle|ticketweb|gigantic|axs|universe\.com|fatsoma|stub ?hub|viagogo|theatre|\bgig\b|festival|museum|gallery|\bzoo\b/ },
    { tags: ['gaming'], name: /steam|playstation|\bpsn\b|xbox|nintendo|epic games|twitch|roblox/ },
    { tags: ['betting'], name: /bet365|paddy\s*power|sky\s*bet|skybet|william\s*hill|betfair|ladbrokes|\bcoral\b|betway|betfred|unibet|\b888|national lottery|lottoland|pokerstars|tombola|gala (bingo|casino)|sportingbet|boylesports|betvictor/ },

    // Body
    { tags: ['gym'], name: /puregym|pure gym|the gym|gym group|david lloyd|nuffield|virgin active|anytime fitness|third space|\bgym\b|fitness|crossfit|yoga|pilates|leisure centre|edinburgh leisure|climbing|bouldering|parkrun/ },
    { tags: ['supplements'], name: /myprotein|\bbulk\b|protein works|holland ?& ?barrett|huel|grenade|optimum nutrition/ },
    { tags: ['haircut'], name: /barber|\bhair|salon|nails|\bspa\b|beauty|lash|brow|tattoo/ },
    { tags: ['health'], name: /dentist|dental|optician|specsavers|vision express|clinic|physio|\bnhs\b|doctor|osteopath|chiropract|therapy|massage/ },

    // Other
    { tags: ['charity'], name: /charity|justgiving|just giving|foundation|cancer research|oxfam|british heart|unicef|red cross|\btrust\b|gofundme/ },
    { tags: ['pets'], name: /pets at home|\bvets?\b|veterinary|petplan|zooplus|jollyes/ },
    { tags: ['cash'], name: /\batm\b|cash withdrawal|cashpoint|link atm|notemachine/ },
    { tags: ['fees'], name: /\bfees?\b|\binterest\b|overdraft|late payment|penalty|\bpcn\b|parking fine/ },
]

const FALLBACK: Record<string, Tag> = {
    GROCERIES: 'groceries',
    EATING_OUT: 'eating-out',
    DRINKS: 'drinks',
    SHOPPING: 'shopping',
    TRANSPORT: 'transport',
    BILLS_AND_SERVICES: 'bills',
    ENTERTAINMENT: 'entertainment',
    HOLIDAYS: 'holidays',
    PERSONAL_CARE: 'personal-care',
    FAMILY: 'family',
    PAYMENTS: 'transfers',
    GAMBLING: 'betting',
    FITNESS: 'gym',
    PETS: 'pets',
    GIFTS: 'gifts',
    CHARITY: 'charity',
    HOME: 'home',
}

const FOOD_AND_DRINK = new Set(['EATING_OUT', 'LIFESTYLE', 'DRINKS'])
const DRINK_TAGS: Tag[] = ['pub', 'bar', 'club', 'drinks']
/** Small payments at one place in a day that read as rounds. */
const ROUNDS_MIN = 3
const ROUND_MAX = 15

function localHour(t: StarlingSpendItem): number {
    const d = new Date(t.time)
    return d.getHours() + d.getMinutes() / 60
}

/** Tags from the name and the moment alone. */
export function tagOne(t: StarlingSpendItem): Tag[] {
    const name = (t.merchant ?? '').toLowerCase()
    const category = t.category ?? ''
    const tags: Tag[] = []
    const add = (...more: Tag[]) => {
        for (const tag of more) if (!tags.includes(tag)) tags.push(tag)
    }

    for (const rule of RULES) {
        if (rule.only && !rule.only.includes(category)) continue
        if (rule.name.test(name)) add(...rule.tags)
    }

    // Context: when and how much.
    const h = localHour(t)
    const food = FOOD_AND_DRINK.has(category) || tags.some((x) => ['coffee', 'bakery', 'restaurant', 'fast-food', 'pub', 'bar'].includes(x))
    if (food && !tags.includes('delivery')) {
        if (h >= 5 && h < 11 && t.amount <= 8 && !tags.some((x) => ['pub', 'bar', 'restaurant'].includes(x))) add('coffee')
        if (h >= 5 && h < 11 && t.amount > 8 && !tags.includes('pub')) add('breakfast')
        if (h >= 11.5 && h < 14.5 && t.amount <= 15 && !tags.some((x) => ['pub', 'bar'].includes(x))) add('lunch')
        if (h >= 17) add('evening-out')
    }
    if (h < 5 && category !== 'BILLS_AND_SERVICES' && category !== 'PAYMENTS') add('late-night')

    const fallback = FALLBACK[category] ?? (category ? 'other' : 'transfers')
    if (!tags.length || !tags.some((x) => x !== 'late-night')) tags.unshift(fallback)
    // A pint isn't eating out, whatever Starling filed it under.
    else if (!(fallback === 'eating-out' && tags.some((x) => DRINK_TAGS.includes(x)))) add(fallback)
    return tags
}

/**
 * Tag a month of payments. Beyond tagOne, it reads the day: three or more small
 * food-and-drink payments at one place on one day are rounds, so they're drinks.
 * The first tag on each payment is its main one.
 */
export function tagAll(items: StarlingSpendItem[]): Map<string, Tag[]> {
    const out = new Map<string, Tag[]>()
    for (const t of items) out.set(t.id, tagOne(t))

    const sameDayPlace = new Map<string, StarlingSpendItem[]>()
    for (const t of items) {
        if (!FOOD_AND_DRINK.has(t.category ?? '') || t.amount > ROUND_MAX) continue
        const key = `${t.date}|${(t.merchant ?? '').toLowerCase()}`
        sameDayPlace.set(key, [...(sameDayPlace.get(key) ?? []), t])
    }
    for (const list of sameDayPlace.values()) {
        if (list.length < ROUNDS_MIN) continue
        for (const t of list) {
            const tags = out.get(t.id)!
            // Rounds read as drinks first, unless the name already said coffee.
            if (tags.includes('coffee') && !tags.includes('evening-out')) continue
            out.set(t.id, ['drinks', ...tags.filter((x) => x !== 'drinks' && x !== 'lunch' && x !== 'eating-out')])
        }
    }
    return out
}

/**
 * Starling files pubs and bars under eating out. Tagged as drinks, they move to
 * their own DRINKS category, so eating out means food and drinks get their own line.
 */
export function refineCategory(t: StarlingSpendItem, tags: Tag[] | undefined): StarlingSpendItem {
    if (t.category !== 'EATING_OUT' || !tags?.some((x) => DRINK_TAGS.includes(x))) return t
    return { ...t, category: 'DRINKS' }
}

/** Words a search should match a payment on: every tag's label. */
export function tagText(tags: Tag[]): string {
    return tags.map((t) => TAGS[t].label.toLowerCase()).join(' ')
}
