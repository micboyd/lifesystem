/**
 * The rooms the wizard offers and the jobs each comes with. The flat rooms
 * (kitchen, bathroom, living room, bedroom, hallway, laundry, whole flat,
 * maintenance) follow the user's own one-bedroom flat checklist; every job
 * comes ticked. Minutes are estimates to edit in the wizard.
 * "Every 3–6 months" jobs default to every 3 months.
 */
import type { CleaningFreq } from '../types'

export interface PresetTask {
    name: string
    minutes: number
    freq: CleaningFreq
    /** Ticked by default when the room is added. */
    on: boolean
}

export interface RoomPreset {
    kind: string
    label: string
    icon: string
    tasks: PresetTask[]
}

/** Lines of "<minutes> <job>" → jobs at one frequency. */
function jobs(freq: CleaningFreq, lines: string, on = true): PresetTask[] {
    return lines
        .trim()
        .split('\n')
        .map((line) => {
            const m = line.trim().match(/^(\d+)\s+(.+)$/)
            if (!m) throw new Error(`bad preset line: ${line}`)
            return { name: m[2], minutes: Number(m[1]), freq, on }
        })
}

export const ROOM_PRESETS: RoomPreset[] = [
    {
        kind: 'kitchen',
        label: 'Kitchen',
        icon: 'fa-kitchen-set',
        tasks: [
            ...jobs('daily', `
                10 Wash all dirty dishes, cutlery, glasses and mugs
                5 Dry dishes and put them away
                3 Wipe down all kitchen worktops
                3 Clean the hob after cooking and once cool
                2 Wipe away grease and food splashes around the cooker
                2 Wipe down the sink and draining board
                1 Rinse food debris from the sink and plughole
                1 Wipe the kitchen tap
                1 Clean up spills immediately
                3 Put away food, ingredients and cooking equipment
                2 Wipe down the dining or food preparation area
                2 Empty the kitchen bin when necessary
                3 Sweep or spot-clean the kitchen floor
                1 Replace dirty tea towels and dishcloths when necessary
            `),
            ...jobs('weekly', `
                10 Thoroughly clean and degrease the ceramic hob
                5 Clean the oven door and exterior controls
                2 Wipe down the air fryer exterior
                10 Wash the air fryer drawers, baskets and removable components
                3 Clean the toaster exterior and empty its crumb tray
                2 Wipe the kettle exterior and base
                5 Clean the microwave interior and exterior
                5 Clean the kitchen sink with a suitable non-abrasive cleaner
                2 Clean and polish the kitchen tap
                3 Scrub the draining board
                5 Wipe the tiled splashbacks, particularly around the hob
                3 Wipe cupboard handles and frequently touched surfaces
                5 Wipe visible marks from cupboard doors
                5 Clean the washing machine door, glass and rubber seal
                2 Remove lint and debris from the washing machine seal
                3 Wipe down the fridge and freezer doors and handles
                3 Check the fridge for expired or spoiled food
                5 Wipe fridge shelves where spills have occurred
                5 Clean and disinfect the kitchen bin
                5 Wash reusable cleaning cloths and sponges
                5 Vacuum the kitchen floor, including corners and edges
                10 Mop the kitchen floor with a floor-compatible cleaner
                5 Wipe accessible skirting boards and kickboards
                2 Clean kitchen light switches and frequently touched sockets
            `),
            ...jobs('monthly', `
                30 Deep-clean the oven interior, racks and trays
                10 Deep-clean the microwave, including the turntable
                5 Descale the kettle if required
                20 Deep-clean the air fryer, including accumulated grease around the heating area, following the manufacturer's instructions
                10 Clean behind and underneath movable countertop appliances
                25 Remove items from the fridge and thoroughly clean shelves and drawers
                5 Clean the fridge door seals
                10 Clean the washing machine detergent drawer
                5 Run the washing machine's recommended maintenance cycle
                10 Clean the washing machine filter according to the manufacturer's instructions
                3 Check the washing machine seal for mould or trapped debris
                10 Wipe the tops of accessible kitchen cupboards
                15 Clean cupboard door fronts and decorative grooves
                10 Clean the underside of wall cupboards
                15 Wipe down all accessible tiled walls
                5 Clean around the sink edges and silicone sealant
                10 Remove limescale around the tap and sink
                3 Check the sink drain for slow drainage or unpleasant smells
                10 Wipe kitchen skirting boards and kickboards thoroughly
                5 Dust the ceiling corners and remove cobwebs
                15 Clean accessible extractor filters according to manufacturer instructions, if fitted
            `),
            ...jobs('quarterly', `
                45 Empty and clean kitchen cupboards internally
                20 Reorganise food storage and check expiry dates
                20 Clean underneath and behind the fridge freezer where safely accessible
                10 Vacuum accessible fridge ventilation areas
                60 Defrost the freezer if required
                45 Deep-clean the oven and removable components
                5 Inspect sealant around the sink and worktops
                5 Inspect kitchen flooring for lifting edges or adhesive residue
                20 Clean and organise the space underneath the sink
                5 Check stored cleaning products for leaks or deterioration
            `),
        ],
    },
    {
        kind: 'bathroom',
        label: 'Bathroom',
        icon: 'fa-bath',
        tasks: [
            ...jobs('daily', `
                2 Rinse the bath and shower area after use
                1 Rinse away soap, shampoo and conditioner residue
                1 Remove hair from the bath or shower drain cover
                1 Wipe or rinse toothpaste residue from the basin
                1 Rinse the sink and tap
                1 Hang towels to dry properly
                1 Open the window or use ventilation to remove moisture
                1 Keep the toilet bowl clean with the toilet brush when necessary
                1 Put toiletries back in their storage locations
                1 Wipe up water spills from the floor
                1 Close the shower curtain fully extended so it can dry
            `),
            ...jobs('weekly', `
                5 Clean and disinfect the toilet bowl
                2 Clean underneath the toilet rim
                3 Clean the toilet seat, lid and hinges
                2 Wipe the toilet flush and cistern
                3 Clean the exterior and base of the toilet
                3 Clean the floor around and behind the toilet
                5 Scrub the bathroom sink and pedestal
                3 Remove toothpaste, soap and limescale deposits
                2 Clean and polish the sink tap
                10 Clean the bath interior
                3 Clean the bath taps and shower fittings
                10 Scrub the bath and shower wall tiles
                5 Clean visible soap scum from the shower area
                5 Clean the shower curtain where needed
                3 Clean the bathroom mirror and mirrored cabinet
                2 Wipe the bathroom cabinet exterior
                2 Clean the toothbrush holder and soap dispenser
                2 Wipe the heated towel rail when cool
                3 Empty and clean the bathroom bin
                1 Replace hand towels
                3 Wash bath towels
                2 Wash the bath mat if used
                3 Vacuum or sweep the bathroom floor
                5 Mop the bathroom floor using a suitable cleaner
                1 Clean the bathroom light switch and door handle
                3 Wipe accessible skirting boards and door edges
            `),
            ...jobs('monthly', `
                30 Deep-clean grout between the bathroom tiles
                5 Inspect and clean silicone around the bath and sink
                10 Remove limescale from the shower head
                10 Descale bath and sink taps as needed
                10 Deep-clean the shower hose and fittings
                5 Wash the shower curtain according to its care label
                3 Clean the shower curtain rail
                5 Remove hair and debris from the bath drain
                5 Clean the sink plug and accessible drain components
                5 Clean the toilet brush and holder
                10 Clean the bathroom cabinet interior
                5 Discard empty or expired toiletries
                15 Wipe down all bathroom wall tiles
                5 Clean the wooden panelling behind the toilet with a lightly damp cloth
                5 Clean the window frame and sill
                5 Dust or clean the bathroom blind according to its material
                5 Clean the bathroom window glass
                5 Clean accessible ventilation grilles
                5 Wipe the bathroom door and frame
                5 Dust ceiling corners and light fittings
                3 Inspect the floor edges for trapped moisture or lifting
            `),
            ...jobs('quarterly', `
                45 Deep-clean the entire tiled bath and shower surround
                5 Inspect grout for cracks or deterioration
                5 Inspect silicone seals for gaps, mould or water damage
                3 Inspect wooden panelling for moisture damage
                15 Thoroughly clean behind and around the toilet where accessible
                20 Deep-clean bathroom storage and reorganise toiletries
                3 Check for slow drainage in the bath and basin
                3 Check the condition of the shower curtain and replace if necessary
                3 Inspect the bathroom floor for movement, lifting or water damage
            `),
        ],
    },
    {
        kind: 'living',
        label: 'Living room',
        icon: 'fa-couch',
        tasks: [
            ...jobs('daily', `
                1 Return cushions and throws to their proper places
                2 Clear cups, glasses, plates and food packaging
                2 Tidy the coffee table
                3 Put away books, electronics and miscellaneous items
                2 Fold and store the clothes drying rack when not in use
                2 Keep the floor clear of clutter
                1 Straighten the sofa and armchair cushions
            `),
            ...jobs('weekly', `
                2 Dust the coffee table
                2 Wipe the coffee table and remove marks
                2 Dust the television screen with a suitable microfibre cloth
                3 Dust the television stand and shelves
                1 Clean the television remote control
                2 Dust the fireplace mantelpiece
                2 Dust the mirror above the fireplace
                5 Wipe decorative ornaments and picture frames
                2 Dust the side tables
                3 Wipe lamp bases and accessible light fittings
                2 Dust the windowsill
                3 Dust the radiator when cool
                5 Wipe accessible skirting boards
                5 Vacuum the sofa cushions and seating surfaces
                5 Vacuum between and underneath removable sofa cushions
                3 Vacuum the armchair upholstery
                5 Remove visible marks from upholstered furniture using a suitable method
                3 Dust plant leaves when necessary
                2 Remove dead leaves from houseplants
                10 Vacuum the carpet thoroughly
                5 Vacuum along carpet edges and corners
                5 Vacuum underneath accessible furniture
                1 Clean light switches and door handles
                1 Empty any living room bins
                3 Water plants according to individual needs
            `),
            ...jobs('monthly', `
                15 Move lightweight furniture and vacuum underneath
                5 Vacuum behind the television stand
                10 Dust and organise television cables
                15 Deep-vacuum the sofa, including seams and crevices
                10 Vacuum the armchair frame and upholstery thoroughly
                10 Clean the window glass internally
                5 Wipe the window frame and sill
                5 Dust blinds or curtains as appropriate
                10 Clean the fireplace surround and hearth
                5 Dust the fireplace opening and decorative fire when completely cool
                5 Clean the fireplace mirror thoroughly
                3 Dust the tops of picture frames
                5 Dust ceiling corners and remove cobwebs
                5 Clean the living room door and frame
                5 Dust the top of the radiator and accessible spaces behind it
                10 Clean plant pots and saucers
                2 Rotate houseplants if required for even growth
                10 Inspect the carpet for stains and spot-clean appropriately
            `),
            ...jobs('quarterly', `
                60 Deep-clean the carpet using a suitable method
                45 Deep-clean upholstered furniture according to care labels
                10 Wash removable cushion covers where permitted
                5 Wash throws and blankets
                15 Clean curtains according to their care instructions
                20 Clean the window frame and surrounding woodwork thoroughly
                20 Deep-clean behind large furniture where safely accessible
                15 Clean the radiator more thoroughly
                10 Check furniture for loose fittings or damage
                20 Clean and reorganise shelving and decorative items
                10 Arrange appropriate inspection or servicing of the gas fire if applicable
            `),
        ],
    },
    {
        kind: 'bedroom',
        label: 'Bedroom',
        icon: 'fa-bed',
        tasks: [
            ...jobs('daily', `
                2 Make the bed
                1 Straighten pillows, duvet and bed throw
                1 Put dirty clothes in the laundry basket
                3 Put clean clothes away
                1 Clear clothes and personal items from the bed
                1 Keep bedside tables tidy
                2 Put away shoes, bags and accessories
                1 Open curtains to allow daylight into the room
                1 Ventilate the bedroom when practical
                1 Keep the floor and access around the bed clear
            `),
            ...jobs('weekly', `
                5 Strip and wash bedsheets
                2 Wash pillowcases
                2 Wash the duvet cover
                10 Replace bedding with a clean set
                3 Dust both bedside tables
                2 Clean bedside lamps and bases
                3 Dust the bed frame and headboard
                3 Dust wardrobe doors and handles
                3 Dust chest of drawers and storage units
                2 Clean the bedroom mirror
                3 Dust picture frames and wall decorations
                3 Dust accessible skirting boards
                2 Wipe the windowsill
                3 Dust the window seat and storage chest
                10 Vacuum or dust-mop the painted wooden floor
                5 Clean floor edges and corners
                5 Remove dust and hair from underneath the bed where accessible
                1 Clean light switches and door handles
                1 Empty the bedroom bin if present
                2 Water bedroom plants according to their needs
            `),
            ...jobs('monthly', `
                10 Vacuum the mattress surface
                10 Vacuum the bed frame and underneath the bed thoroughly
                10 Clean between floorboard gaps using a vacuum attachment
                10 Wipe the painted floor with a barely damp mop and suitable cleaner
                3 Dust the tops of wardrobes
                5 Clean wardrobe door fronts
                10 Clean inside frequently used drawers
                15 Organise clothing and remove unnecessary clutter
                3 Dust the tops of storage units
                10 Clean the bedroom window glass
                5 Wipe the window frames and surrounding woodwork
                5 Vacuum or brush curtains
                10 Clean the window seat and storage compartment
                5 Dust ceiling corners and remove cobwebs
                5 Clean the bedroom door and frame
                3 Dust accessible light fittings
                5 Clean behind bedside tables
                3 Check plants for dead leaves or pests
            `),
            ...jobs('quarterly', `
                10 Rotate the mattress if recommended by the manufacturer
                5 Wash the mattress protector
                5 Wash pillows according to care labels
                10 Wash the duvet according to its care label
                15 Wash or professionally clean curtains as appropriate
                20 Deep-clean underneath the bed
                20 Move suitable furniture and clean behind it
                45 Empty and reorganise wardrobes
                30 Sort seasonal clothing
                20 Donate or dispose of unwanted clothing
                20 Deep-clean the window seat and storage chest
                5 Inspect painted floorboards for damage or worn finishes
                5 Check bedroom walls and window areas for condensation or mould
            `),
        ],
    },
    {
        kind: 'hallway',
        label: 'Hallway',
        icon: 'fa-door-open',
        tasks: [
            ...jobs('daily', `
                1 Hang coats and jackets properly
                1 Return shoes to the shoe rack
                1 Keep the entrance clear of loose footwear
                1 Put away bags, backpacks and accessories
                2 Remove letters, packaging and unnecessary clutter
                1 Keep access to doors and rooms unobstructed
                2 Wipe up water or mud brought in from outside
            `),
            ...jobs('weekly', `
                5 Vacuum the hallway carpet
                3 Vacuum carpet edges and corners
                2 Vacuum around the shoe rack
                3 Remove loose dirt from the entrance area
                2 Dust the shoe rack
                2 Wipe coat hooks and the coat rail
                3 Dust accessible skirting boards
                2 Clean the front door handle and lock area
                2 Wipe interior door handles and light switches
                2 Dust the radiator when cool
                5 Clean visible marks from the hallway walls
                3 Organise shoes and remove pairs left on the floor
                3 Shake out or clean any entrance mat
            `),
            ...jobs('monthly', `
                15 Remove all shoes and thoroughly clean the shoe rack
                5 Clean underneath and behind the shoe rack
                10 Sort coats and jackets
                5 Remove unused bags and accessories from the coat area
                5 Vacuum behind hanging coats
                5 Clean the entrance door interior
                5 Clean door frames and surrounding trim
                5 Wipe down the radiator
                3 Dust ceiling corners and remove cobwebs
                3 Dust the hallway light fitting
                10 Spot-clean carpet stains
                5 Clean accessible high-level ledges and surfaces
                3 Inspect the entrance area for scuff marks and dirt buildup
            `),
            ...jobs('quarterly', `
                30 Deep-clean the hallway carpet
                15 Wash coats and jackets according to their care labels
                15 Sort seasonal footwear
                10 Clean and deodorise the shoe rack
                15 Deep-clean the entrance door and frame
                5 Check door hinges and handles for loose fittings
                20 Reorganise hallway storage
                15 Clean behind and beneath movable furniture
            `),
        ],
    },
    {
        kind: 'utility',
        label: 'Laundry',
        icon: 'fa-shirt',
        tasks: [
            ...jobs('daily', `
                1 Put dirty clothing into the laundry basket
                2 Separate laundry according to colour and fabric care requirements
                3 Run washing loads when required
                2 Remove laundry promptly after washing
                5 Hang clothes to dry or use an appropriate dryer
                1 Ensure drying clothes have adequate ventilation
                5 Fold dry clothes
                3 Put clean laundry away
                1 Avoid leaving damp laundry sitting in the washing machine
            `),
            ...jobs('weekly', `
                5 Wash everyday clothing
                3 Wash gym and sports clothing after use
                3 Wash underwear and socks
                3 Wash bath towels
                2 Wash hand towels
                2 Wash kitchen tea towels and dishcloths
                5 Wash bedding
                3 Wash reusable cleaning cloths separately as appropriate
                3 Clean the laundry basket if necessary
                2 Wipe the clothes drying rack
                2 Check the washing machine seal for trapped items
            `),
            ...jobs('monthly', `
                10 Clean the washing machine detergent drawer
                5 Run a washing machine maintenance cycle
                10 Clean the washing machine filter according to instructions
                10 Clean the clothes drying rack thoroughly
                5 Check towels and bedding for wear
                10 Reorganise laundry products and supplies
            `),
            ...jobs('quarterly', `
                10 Wash pillows and duvets where permitted
                5 Wash mattress and pillow protectors
                5 Wash throws and blankets
                15 Clean curtains according to their care instructions
                10 Wash seasonal bedding before storing
                5 Inspect the washing machine hoses for visible leaks or deterioration
            `),
        ],
    },
    {
        kind: 'whole',
        label: 'Whole flat',
        icon: 'fa-house-chimney',
        tasks: [
            ...jobs('daily', `
                10 Spend 10 minutes returning items to their proper places
                3 Remove rubbish and food packaging
                2 Deal with spills and visible dirt immediately
                2 Keep frequently used surfaces clear
                1 Open windows briefly when appropriate for ventilation
                1 Check that damp towels and clothing are drying properly
            `),
            ...jobs('weekly', `
                5 Empty all household bins
                2 Replace bin liners
                5 Take out recycling
                20 Vacuum all carpeted areas
                10 Vacuum or sweep all hard floors
                15 Mop kitchen and bathroom floors
                10 Dust frequently used furniture
                5 Clean mirrors
                3 Wipe door handles
                3 Wipe light switches
                5 Clean visible marks from doors and frames
                10 Dust accessible skirting boards
                5 Clean frequently touched surfaces
                3 Check for cobwebs
                5 Wash and dry reusable cleaning cloths
                5 Clean and dry mop heads and buckets after use
                3 Empty the vacuum cleaner if required
                3 Check cleaning supplies and replace anything running low
            `),
            ...jobs('monthly', `
                30 Clean internal windows throughout the flat
                15 Clean window frames and sills
                10 Dust high shelves and cupboard tops
                10 Remove cobwebs from ceilings and corners
                10 Dust light fittings when cool
                15 Wipe doors and door frames
                20 Clean skirting boards thoroughly
                10 Dust accessible radiators
                15 Vacuum under movable furniture
                15 Clean behind accessible furniture
                5 Wipe accessible electrical cables and plugs with a dry cloth
                5 Check for condensation, damp or mould
                10 Clean ventilation grilles
                5 Check bins for lingering odours
                10 Reorganise household cleaning supplies
                10 Clean the vacuum cleaner attachments
                5 Inspect floors for damage or lifting edges
            `),
            ...jobs('quarterly', `
                60 Deep-clean all carpets and rugs as required
                45 Deep-clean upholstered furniture
                30 Clean behind larger furniture and appliances where safely accessible
                30 Wash or clean curtains and other soft furnishings
                30 Clean internal windows and frames thoroughly
                10 Inspect window seals for condensation or mould
                10 Inspect bathroom and kitchen sealant
                10 Check for leaks under sinks and around appliances
                5 Test smoke and carbon monoxide alarms according to manufacturer guidance
                5 Check the condition of extension leads and electrical cables
                5 Check expiry dates on first-aid supplies
                45 Declutter cupboards and storage spaces
                30 Dispose of unwanted or broken household items responsibly
                10 Review household cleaning equipment and replace worn items
            `),
        ],
    },
    {
        kind: 'maintenance',
        label: 'Yearly upkeep',
        icon: 'fa-screwdriver-wrench',
        tasks: jobs('yearly', `
            15 Arrange gas appliance servicing where applicable
            10 Review smoke and carbon monoxide alarm replacement dates
            180 Deep-clean the entire flat, including difficult-to-reach areas
            20 Inspect walls and ceilings for signs of damp or leaks
            15 Inspect flooring for wear, movement or damage
            15 Inspect window seals and frames
            15 Check silicone and grout in wet areas
            10 Review the condition of mattresses and pillows
            10 Review the condition of curtains and upholstery
            10 Check kitchen and bathroom ventilation
            10 Review the condition of cleaning equipment
            120 Carry out a full household declutter
            15 Inspect appliances for signs of wear or damage
            15 Check whether any walls, woodwork or painted surfaces need touching up
        `),
    },
    // Rooms the flat checklist doesn't cover keep a short list of their own.
    {
        kind: 'toilet',
        label: 'Toilet',
        icon: 'fa-toilet',
        tasks: [
            ...jobs('weekly', `
                10 Clean the toilet
                5 Clean the sink
                5 Mop the floor
            `),
        ],
    },
    {
        kind: 'dining',
        label: 'Dining room',
        icon: 'fa-utensils',
        tasks: [
            ...jobs('3x-week', '5 Wipe the table'),
            ...jobs('weekly', '10 Hoover the floor'),
            ...jobs('fortnightly', '10 Dust surfaces'),
        ],
    },
    {
        kind: 'office',
        label: 'Office',
        icon: 'fa-computer',
        tasks: jobs('weekly', `
            10 Clear the desk
            5 Dust surfaces
            10 Hoover the floor
        `),
    },
    {
        kind: 'stairs',
        label: 'Stairs',
        icon: 'fa-stairs',
        tasks: [...jobs('weekly', '15 Hoover the stairs'), ...jobs('fortnightly', '5 Wipe the banister')],
    },
    {
        kind: 'outside',
        label: 'Outside',
        icon: 'fa-seedling',
        tasks: [...jobs('fortnightly', '20 Sweep the patio'), ...jobs('monthly', '10 Tidy the bins area', false)],
    },
]

/** From the checklist's safety notes: shown on the Cleaning page, not scheduled. */
export const SAFETY_NOTES = [
    'Use cleaners suitable for each surface, particularly painted wooden floors, ceramic hobs, stainless steel and bathroom fittings.',
    'Avoid soaking the bedroom floorboards or allowing water to sit in their gaps.',
    'Do not use abrasive pads on the hob, sink or delicate finishes.',
    'Never mix bleach with vinegar, descalers, ammonia or other cleaning products.',
    'Follow product instructions for dilution, ventilation and contact time.',
    'Use separate cleaning cloths for the toilet and kitchen.',
    'Avoid spraying cleaning products directly onto electrical appliances, switches or sockets.',
    'Allow appliances and light fittings to cool before cleaning.',
    'Never pull heavy appliances out by their hoses, cables or pipework.',
    'Investigate recurring mould, leaks or flooring problems rather than repeatedly cleaning over them.',
    'Keep cleaning products safely stored and away from food.',
]
