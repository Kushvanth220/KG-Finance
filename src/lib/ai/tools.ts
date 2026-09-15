/** Shared Gemini function declarations for text + live voice. */
export const ASSISTANT_FUNCTION_DECLARATIONS = [
  {
    name: "list_accounts",
    description:
      "List bank accounts (debit, credit, cash) with ids, names, types, and balances. Use for_person when asking which account Kushvanth or G paid from.",
    parameters: {
      type: "object",
      properties: {
        for_person: {
          type: "string",
          description: "kushvanth or g — whose accounts to list. Defaults to the current user.",
        },
      },
    },
  },
  {
    name: "add_account",
    description:
      "Create a new bank account, credit card, or cash wallet in the app (e.g. 'add my DD Crimson debit card'). Needs a verbal yes first, like any money change. Use list_accounts first so you do not create a duplicate.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Account name exactly as the user says it, e.g. 'DD Crimson'." },
        account_type: {
          type: "string",
          description: "debit, credit, or cash.",
        },
        for_person: {
          type: "string",
          description: "kushvanth or g — whose account this is. Defaults to the current user.",
        },
        starting_balance: {
          type: "number",
          description: "Current balance. For a credit card this is the amount owed. Defaults to 0.",
        },
        credit_limit: {
          type: "number",
          description: "Credit limit — only for a credit card.",
        },
        shared: {
          type: "boolean",
          description: "True when both of them use this account (like the shared GreenDot).",
        },
        user_confirmed: {
          type: "boolean",
          description: "Only true after the user said yes to the exact account being created.",
        },
      },
      required: ["name", "account_type"],
    },
  },
  {
    name: "list_spend_categories",
    description: "List spend categories (Groceries, Gas, etc.) available in the app.",
  },
  {
    name: "list_income_sources",
    description:
      "List the user's income sources (Doordash, Salary, etc.) with ids and names. Call before recording income if the source is unclear.",
  },
  {
    name: "record_income",
    description:
      "Record a new income deposit. Creates a history entry and credits the chosen account. Only call after you know amount, source, and deposit account.",
    parameters: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Income amount in USD" },
        source_name: {
          type: "string",
          description: "Income source label, e.g. Doordash, Salary, On campus",
        },
        deposit_account_id: {
          type: "string",
          description: "Account id from list_accounts where money was deposited",
        },
        deposit_account_name: {
          type: "string",
          description: "Alternative to deposit_account_id — partial account name match",
        },
        date: {
          type: "string",
          description: "Date yyyy-MM-dd. Defaults to today.",
        },
        notes: { type: "string", description: "Optional note" },
        for_person: {
          type: "string",
          description: "Whose income: kushvanth or g",
        },
        user_confirmed: {
          type: "boolean",
          description: "Must be true only after the user verbally confirms the preview.",
        },
      },
      required: ["amount", "source_name"],
    },
  },
  {
    name: "record_expense",
    description:
      "Record spending exactly like the Spend page. Ask who the expense is for, who paid, and which account(s) — including splits between Kushvanth and G. Do not call until those details are clear.",
    parameters: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Total expense amount in USD" },
        category: {
          type: "string",
          description: "Spend category, e.g. Groceries, Gas, Food",
        },
        notes: { type: "string", description: "Optional note — also used to guess category" },
        expense_for: {
          type: "string",
          description:
            "Whose cost: kushvanth, g, or both. 'me' is whoever is speaking. 'me and G', 'we spent', or 'split' = both. This is NOT who paid.",
        },
        paid_by: {
          type: "string",
          description:
            "Who paid the money: kushvanth, g, or split when both paid part. Default to whoever is speaking unless they name someone else. A shared expense can be paid entirely by G (paid_by g, expense_for both).",
        },
        split_expense_evenly: {
          type: "boolean",
          description:
            "When expense_for is both, split the expense 50/50. Default true if shares not given.",
        },
        kushvanth_expense_share: {
          type: "number",
          description: "Kushvanth's share of the expense when expense_for is both",
        },
        g_expense_share: {
          type: "number",
          description: "G's share of the expense when expense_for is both",
        },
        account_id: {
          type: "string",
          description: "Paying account id (single payer — use payer's account)",
        },
        account_name: {
          type: "string",
          description: "Alternative to account_id — partial account name for the payer",
        },
        cash_source_account_id: {
          type: "string",
          description: "If paying from cash wallet, optional debit account the cash came from",
        },
        cash_source_account_name: {
          type: "string",
          description: "Alternative to cash_source_account_id",
        },
        kushvanth_paid_amount: {
          type: "number",
          description: "When paid_by is split — how much Kushvanth paid",
        },
        g_paid_amount: {
          type: "number",
          description: "When paid_by is split — how much G paid",
        },
        kushvanth_account_id: { type: "string", description: "Kushvanth's account when paid_by is split" },
        kushvanth_account_name: { type: "string" },
        g_account_id: { type: "string", description: "G's account when paid_by is split" },
        g_account_name: { type: "string" },
        kushvanth_cash_source_account_id: { type: "string" },
        g_cash_source_account_id: { type: "string" },
        user_confirmed: {
          type: "boolean",
          description: "Must be true only after the user verbally confirms the preview.",
        },
      },
      required: ["amount"],
    },
  },
  {
    name: "add_debt",
    description: "Add a new debt note for the user.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Who or what is owed, e.g. Credit card, John" },
        amount: { type: "number", description: "Debt amount in USD" },
        notes: { type: "string", description: "Optional note" },
        user_confirmed: {
          type: "boolean",
          description: "Must be true only after the user verbally confirms the preview.",
        },
      },
      required: ["name", "amount"],
    },
  },
  {
    name: "record_debt_payment",
    description: "Record a payment toward an existing debt (without choosing a bank account).",
    parameters: {
      type: "object",
      properties: {
        debt_id: { type: "string", description: "Debt id from the snapshot" },
        debt_name: { type: "string", description: "Partial debt name match" },
        amount: { type: "number", description: "Payment amount in USD" },
        notes: { type: "string", description: "Optional note" },
        user_confirmed: {
          type: "boolean",
          description: "Must be true only after the user verbally confirms the preview.",
        },
      },
      required: ["amount"],
    },
  },
  {
    name: "pay_debt_from_account",
    description: "Pay a debt from a specific bank account.",
    parameters: {
      type: "object",
      properties: {
        debt_id: { type: "string" },
        debt_name: { type: "string" },
        amount: { type: "number" },
        from_account_id: { type: "string" },
        from_account_name: { type: "string" },
        notes: { type: "string" },
        user_confirmed: {
          type: "boolean",
          description: "Must be true only after the user verbally confirms the preview.",
        },
      },
      required: ["amount"],
    },
  },
  {
    name: "adjust_account_balance",
    description:
      "Set an account to an exact current balance (Green Dot, Chime, etc.). Use when the user says update/set/change/adjust the balance. This writes to Accounts and History. Ask for the new balance if missing, read it back, wait for yes, then call again with user_confirmed true.",
    parameters: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Account id from list_accounts" },
        account_name: {
          type: "string",
          description: "Account name, e.g. GreenDot, Green Dot, Chime",
        },
        new_balance: {
          type: "number",
          description: "The exact new balance in USD, e.g. 600",
        },
        notes: { type: "string", description: "Optional note for History" },
        user_confirmed: {
          type: "boolean",
          description: "Must be true only after the user confirms the preview.",
        },
      },
      required: ["new_balance"],
    },
  },
  {
    name: "calculate_monthly_summary",
    description:
      "Calculate monthly income and spend totals for a person using the app's algorithms. Use before stating totals.",
    parameters: {
      type: "object",
      properties: {
        for_person: { type: "string", description: "kushvanth or g" },
        month: { type: "string", description: "Optional yyyy-MM, defaults to current month" },
      },
      required: ["for_person"],
    },
  },
  {
    name: "calculate_net_worth",
    description: "Calculate net worth (accounts minus debts) for a person or workspace.",
    parameters: {
      type: "object",
      properties: {
        for_person: {
          type: "string",
          description: "kushvanth, g, or omit for both combined",
        },
      },
    },
  },
  {
    name: "calculate_category_breakdown",
    description: "Group current month expenses by category for a person.",
    parameters: {
      type: "object",
      properties: {
        for_person: { type: "string", description: "kushvanth or g" },
        month: { type: "string", description: "Optional yyyy-MM" },
      },
      required: ["for_person"],
    },
  },
  {
    name: "calculate_between_us_balance",
    description: "Get the shared settlement balance and who owes whom.",
  },
  {
    name: "preview_expense_split",
    description:
      "Preview split math before recording — equal or custom shares, returns per-person amounts.",
    parameters: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Total expense amount" },
        split_evenly: { type: "boolean", description: "Default true — 50/50 split" },
        kushvanth_share: { type: "number" },
        g_share: { type: "number" },
      },
      required: ["amount"],
    },
  },
  {
    name: "save_behavior_preference",
    description:
      "Save a standing instruction to follow in future sessions (e.g. be more concise, always show cents). Call it as soon as they say to remember something - the app shows a confirmation card and takes the yes there. Saying you will remember, without this call, saves nothing.",
    parameters: {
      type: "object",
      properties: {
        instruction: { type: "string", description: "The preference to remember" },
      },
      required: ["instruction"],
    },
  },
  {
    name: "save_reminder",
    description:
      "Save a reminder, bill, schedule, or to-do. Use when they say remind me, remember, don't forget, or describe a recurring bill. Call it straight away with the schedule filled in - the app shows a confirmation card and takes the yes there.",
    parameters: {
      type: "object",
      properties: {
        reminder: { type: "string", description: "What to remember, in the user's words" },
        repeat: {
          type: "string",
          description:
            "How often it repeats: once, weekly, monthly, or yearly. Set this whenever they say a cycle like 'every month' or 'every Friday'.",
        },
        day_of_month: {
          type: "number",
          description: "1-31, for monthly or yearly. E.g. 'the 3rd of every month' -> 3.",
        },
        weekday: {
          type: "number",
          description: "0=Sunday .. 6=Saturday, for weekly. E.g. 'every Friday' -> 5.",
        },
        month: { type: "number", description: "1-12, for yearly only." },
        date: { type: "string", description: "yyyy-MM-dd, for a one-time reminder." },
        time: { type: "string", description: "24h HH:mm, only if they gave a time of day." },
        lead_days: {
          type: "number",
          description:
            "How many days before the due date to raise it. Workspace default is 5 — only change it if they ask.",
        },
        when: {
          type: "string",
          description:
            "Free-text timing, only when it does not fit the fields above (e.g. 'from the 24th to the 26th').",
        },
        timezone: {
          type: "string",
          description: "us or india — India bills should mention both time zones",
        },
        person: {
          type: "string",
          description:
            "kushvanth or g when the reminder is one person's (their own bill, their own task). Leave out for shared reminders both should see.",
        },
      },
      required: ["reminder"],
    },
  },
  {
    name: "update_income_source",
    description:
      "Rename an income source (e.g. 'call it Amazon Flex instead of Custom'). Match by the current name.",
    parameters: {
      type: "object",
      properties: {
        match: { type: "string", description: "Current name, or enough of it to be unique" },
        new_name: { type: "string" },
      },
      required: ["match", "new_name"],
    },
  },
  {
    name: "delete_income_source",
    description: "Delete an income source that is no longer used. Existing income entries keep their history.",
    parameters: {
      type: "object",
      properties: { match: { type: "string", description: "Name, or enough of it to be unique" } },
      required: ["match"],
    },
  },
  {
    name: "update_spend_category",
    description:
      "Rename a spend category, change its keywords, or set its monthly budget (e.g. 'budget $400 for groceries').",
    parameters: {
      type: "object",
      properties: {
        match: { type: "string", description: "Current name, or enough of it to be unique" },
        new_name: { type: "string" },
        keywords: { type: "array", items: { type: "string" }, description: "Replaces the keyword list" },
        budget: { type: "number", description: "Monthly budget in dollars; 0 clears it" },
      },
      required: ["match"],
    },
  },
  {
    name: "delete_spend_category",
    description: "Delete a spend category. Past expenses keep the name as text.",
    parameters: {
      type: "object",
      properties: { match: { type: "string", description: "Name, or enough of it to be unique" } },
      required: ["match"],
    },
  },
  {
    name: "update_debt",
    description:
      "Change a debt's name, outstanding amount, or note — e.g. 'the India debt is $150 now'. This edits the record; to log a payment use record_debt_payment.",
    parameters: {
      type: "object",
      properties: {
        match: { type: "string", description: "Debt name, or enough of it to be unique" },
        name: { type: "string" },
        amount: { type: "number", description: "New outstanding amount" },
        notes: { type: "string" },
      },
      required: ["match"],
    },
  },
  {
    name: "delete_debt",
    description: "Remove a debt note entirely. Prefer record_debt_payment or marking it cleared when it was actually paid.",
    parameters: {
      type: "object",
      properties: { match: { type: "string", description: "Debt name, or enough of it to be unique" } },
      required: ["match"],
    },
  },
  {
    name: "update_reminder",
    description:
      "Change an existing reminder — its wording, its schedule, or how early it is raised. Call this directly with words from the reminder in match; it finds the reminder itself and tells you if nothing or more than one matched. Needs a yes.",
    parameters: {
      type: "object",
      properties: {
        match: {
          type: "string",
          description: "Words from the existing reminder, enough to identify it uniquely.",
        },
        new_text: { type: "string", description: "Replacement wording, if they changed it." },
        repeat: { type: "string", description: "once, weekly, monthly, or yearly." },
        day_of_month: { type: "number", description: "1-31, for monthly or yearly." },
        weekday: { type: "number", description: "0=Sunday .. 6=Saturday, for weekly." },
        month: { type: "number", description: "1-12, for yearly." },
        date: { type: "string", description: "yyyy-MM-dd, for a one-time reminder." },
        time: { type: "string", description: "24h HH:mm." },
        lead_days: { type: "number", description: "Days before the due date to raise it." },
        user_confirmed: {
          type: "boolean",
          description: "Only true after they said yes to this exact change.",
        },
      },
      required: ["match"],
    },
  },
  {
    name: "delete_reminder",
    description:
      "Forget a reminder completely. Use when they say stop reminding me, remove it, or it is finished for good. Call this directly with words from the reminder in match. Needs a yes.",
    parameters: {
      type: "object",
      properties: {
        match: { type: "string", description: "Words from the reminder to remove." },
        user_confirmed: {
          type: "boolean",
          description: "Only true after they said yes to removing this one.",
        },
      },
      required: ["match"],
    },
  },
  {
    name: "list_behavior_preferences",
    description:
      "List the standing rules the assistant follows. Call before changing or removing one.",
  },
  {
    name: "delete_behavior_preference",
    description:
      "Stop following one of the saved behaviour rules. Needs a yes.",
    parameters: {
      type: "object",
      properties: {
        match: { type: "string", description: "Words from the rule to remove." },
        user_confirmed: {
          type: "boolean",
          description: "Only true after they said yes to removing this rule.",
        },
      },
      required: ["match"],
    },
  },
  {
    name: "list_reminders",
    description: "List all saved reminders, bills, and notes with pending/done status.",
  },
  {
    name: "mark_reminder_done",
    description:
      "Mark a reminder or bill as done for this cycle after the user confirms they paid, submitted, or canceled it.",
    parameters: {
      type: "object",
      properties: {
        reminder: {
          type: "string",
          description: "Partial match of the reminder text, e.g. rent, Workday, T-Mobile",
        },
      },
      required: ["reminder"],
    },
  },
  {
    name: "get_daily_briefing",
    description:
      "Get today's date plus due/pending reminders. Call this when the user asks what's up, any updates, or after greeting before mentioning reminders.",
  },
  {
    name: "list_rules",
    description:
      "List the rules - the standing instructions the user wrote for how something works (e.g. Amazon Flex blocks). Read this before answering anything the rules might govern, and before creating a rule so you do not duplicate one.",
    parameters: {
      type: "object",
      properties: {
        for_person: { type: "string", description: "kushvanth, g, or workspace. Omit for all." },
      },
    },
  },
  {
    name: "read_rule_table",
    description:
      "Read one rule's recorded entries back as a table, with column totals. Use whenever they ask to see the data a rule has collected, or ask for it 'in a table'.",
    parameters: {
      type: "object",
      properties: {
        match: { type: "string", description: "Words from the rule's name, e.g. 'amazon flex'." },
        limit: { type: "number", description: "How many rows. Default 20, newest first." },
      },
      required: ["match"],
    },
  },
  {
    name: "list_due_followups",
    description:
      "Questions a rule says to ask NOW - e.g. an Amazon Flex block logged 27 hours ago whose tips are still unknown. Call this in the daily briefing and whenever they ask what is pending. Ask these one at a time.",
  },
  {
    name: "create_rule",
    description:
      "Write down a new rule: what to ask, when, what to record, what to work out, and what to chart. Build the WHOLE rule in one call from what they described - fields are what to RECORD each time, so never ask what the amounts are first. Call it as soon as you understand the shape: the app shows them the rule and takes the yes. Do not describe the rule in a message and wait.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short name, e.g. 'Amazon Flex blocks'." },
        scope: { type: "string", description: "kushvanth, g, or shared." },
        description: { type: "string", description: "The rule in their own words." },
        trigger_kind: {
          type: "string",
          description:
            "conversation_start, daily, weekly, monthly, or manual. Use conversation_start when it belongs to the catch-up at the top of a chat rather than to a clock time.",
        },
        repeatable: {
          type: "boolean",
          description:
            "True when one trigger can produce several records in a day, like Flex blocks or shifts. You then keep asking 'any more?' until they say no.",
        },
        trigger_question: { type: "string", description: "What you ask, e.g. 'Any Amazon Flex blocks today?'" },
        trigger_time: { type: "string", description: "HH:mm to ask at." },
        trigger_weekday: { type: "number", description: "0=Sunday..6=Saturday, for weekly." },
        trigger_day_of_month: { type: "number", description: "1-31, for monthly." },
        fields: {
          type: "array",
          description:
            "What to record. Each: {key, label, type (money/number/text/date/time), ask_at ('start' or 'follow_up'), question, required, ask_if}. Keys are lowercase with underscores and are used in calculations. ask_if is {field, equals} and gates the question on an earlier answer - {field: 'used_own_car', equals: 'yes'} only asks it when they said yes.",
          items: { type: "object" },
        },
        follow_ups: {
          type: "array",
          description:
            "Delayed questions. Each: {after_hours, question, fields:[field keys], anchor_field}. anchor_field counts the delay from a time RECORDED on the entry instead of from when it was logged - Amazon Flex tips are after_hours 27 with anchor_field start_time, so each block gets its own clock instead of all of them firing together.",
          items: { type: "object" },
        },
        calculations: {
          type: "array",
          description:
            "Numbers to work out. Each: {key, label, expression, money}. Expressions use field keys and + - * / ( ), e.g. 'base_pay + tips'.",
          items: { type: "object" },
        },
        charts: {
          type: "array",
          description:
            "Charts for the dashboard. Each: {title, type (bar/line/area/pie/donut/scatter/bubble), x, y, size}. x is 'date' or a field key.",
          items: { type: "object" },
        },
        show_on_dashboard: { type: "boolean", description: "Put its table and charts on the dashboard." },
        payout_kind: { type: "string", description: "income, expense, or none - whether the total is real money." },
        payout_amount_key: { type: "string", description: "Which calculation carries the amount, e.g. 'total'." },
        payout_target: { type: "string", description: "Income source or spend category name." },
        user_confirmed: { type: "boolean", description: "Only true after they said yes to this exact rule." },
      },
      required: ["name", "trigger_question"],
    },
  },
  {
    name: "update_rule",
    description:
      "Change an existing rule - its question, timing, fields, calculations, or charts. Call directly with words from its name in match. Needs a yes.",
    parameters: {
      type: "object",
      properties: {
        match: { type: "string", description: "Words from the rule's name." },
        name: { type: "string", description: "New name." },
        description: { type: "string" },
        enabled: { type: "boolean", description: "false pauses the rule without deleting it." },
        trigger_kind: { type: "string", description: "conversation_start, daily, weekly, monthly, or manual." },
        repeatable: { type: "boolean", description: "Several records per trigger." },
        trigger_question: { type: "string" },
        trigger_time: { type: "string" },
        trigger_weekday: { type: "number" },
        trigger_day_of_month: { type: "number" },
        fields: { type: "array", description: "Fields to add or change, matched by key. Anything you leave out is kept. To remove one, tell them to use the Rules page.", items: { type: "object" } },
        follow_ups: { type: "array", description: "Replaces all follow-ups.", items: { type: "object" } },
        calculations: { type: "array", description: "Calculations to add or change, matched by key. Anything you leave out is kept.", items: { type: "object" } },
        charts: { type: "array", description: "Replaces all charts.", items: { type: "object" } },
        show_on_dashboard: { type: "boolean" },
        user_confirmed: { type: "boolean", description: "Only true after they said yes to this exact change." },
      },
      required: ["match"],
    },
  },
  {
    name: "delete_rule",
    description:
      "Delete a rule and every entry recorded under it. Needs a yes. Prefer update_rule with enabled false if they only want it to stop asking.",
    parameters: {
      type: "object",
      properties: {
        match: { type: "string", description: "Words from the rule's name." },
        user_confirmed: { type: "boolean", description: "Only true after they said yes to removing it." },
      },
      required: ["match"],
    },
  },
  {
    name: "log_rule_entry",
    description:
      "Record one occurrence under a rule - a single Amazon Flex block with its base pay. Call this DIRECTLY as soon as you have an amount; do not list the rule first and do not ask for confirmation in words, because the app shows a confirmation card. Near-miss field names are resolved for you (base -> base_pay) and the tool names the real keys if it cannot. This touches NO account and never moves money, so never ask which account to use. One call per occurrence - three blocks today is three calls. Needs a yes.",
    parameters: {
      type: "object",
      properties: {
        match: { type: "string", description: "Words from the rule's name." },
        values: {
          type: "object",
          description: "Field key to value, e.g. {\"base_pay\": 62.50}.",
        },
        date: { type: "string", description: "yyyy-MM-dd. Defaults to today." },
        user_confirmed: { type: "boolean", description: "Only true after they said yes." },
      },
      required: ["match", "values"],
    },
  },
  {
    name: "answer_rule_followup",
    description:
      "Fill in the values a follow-up was waiting for - the tips on a block logged 27 hours ago. Use the entry_id from list_due_followups, and the rule's exact field keys. Touches no account. Needs a yes, because it usually completes a money figure.",
    parameters: {
      type: "object",
      properties: {
        entry_id: { type: "string", description: "From list_due_followups." },
        values: { type: "object", description: "Field key to value, e.g. {\"tips\": 11.25}." },
        follow_up_id: { type: "string", description: "From list_due_followups." },
        user_confirmed: { type: "boolean", description: "Only true after they said yes." },
      },
      required: ["entry_id", "values"],
    },
  },
  {
    name: "update_rule_entry",
    description:
      "Correct an entry already recorded under a rule - a wrong amount, a wrong time, or the wrong DATE (a block logged today that actually happened yesterday). Get entry_id from read_rule_table. Never tell them a recorded entry cannot be changed. Needs a yes.",
    parameters: {
      type: "object",
      properties: {
        entry_id: { type: "string", description: "From read_rule_table." },
        values: {
          type: "object",
          description: "Only the fields to change, by the rule's field names. Others stay as they are.",
        },
        date: { type: "string", description: "yyyy-MM-dd, to move it to a different day." },
        user_confirmed: { type: "boolean", description: "Only true after they said yes to this exact change." },
      },
      required: ["entry_id"],
    },
  },
  {
    name: "delete_rule_entry",
    description:
      "Remove one entry recorded under a rule - something logged twice, or logged by mistake. Get entry_id from read_rule_table. Needs a yes.",
    parameters: {
      type: "object",
      properties: {
        entry_id: { type: "string", description: "From read_rule_table." },
        user_confirmed: { type: "boolean", description: "Only true after they said yes to removing it." },
      },
      required: ["entry_id"],
    },
  },
];

export const ASSISTANT_TOOLS = [{ functionDeclarations: ASSISTANT_FUNCTION_DECLARATIONS }];

export interface AssistantToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface AssistantToolResult {
  id: string;
  name: string;
  result: Record<string, unknown>;
}
