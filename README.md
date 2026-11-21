# Smart Receipt Scanner

SMARTFIN — VISUAL TRANSACTION INTELLIGENCE



Feature Specification, Data Extraction Engine and End-to-End Implementation



ROLE



Act as a senior AI application engineer, OCR engineer, financial data processing specialist and full-stack developer working on the existing SMARTFIN application.



Your responsibility is to implement a production-minded Visual Transaction Intelligence feature.



Do not create a standalone demo. Integrate the feature into the existing SMARTFIN application, reusing its current architecture, database, authentication, transaction model, UI components and design system.



Do not replace the existing technology stack.



---



1. PRODUCT OBJECTIVE



SMARTFIN must allow a user to provide an image of a financial document and automatically convert the information contained in that image into a structured financial record.



The user should not need to manually type every transaction detail.



The system must be capable of understanding:



1. UPI payment confirmation screenshots.

2. Bank debit and credit transaction screenshots.

3. Payment success and failure screens.

4. Retail shopping receipts.

5. Restaurant and food delivery receipts.

6. Grocery bills.

7. Online shopping invoices.

8. Electricity, water, internet and other utility bills.

9. Subscription payment confirmations.

10. Refund confirmations.

11. Other financial documents containing transaction information.



The feature must distinguish between a document that merely describes an amount and evidence that a payment actually occurred.



Core principle: Extract what is present, infer only what is reasonably supported, and never invent missing financial information.



2. USER EXPERIENCE AND ENTRY POINTS



Add a feature called:



Scan & Extract



Place the entry point in the existing Add Transaction workflow and provide an accessible shortcut from the Transactions screen.



The user must have three input options:



A. Upload from gallery



- Allow the user to select a supported image.

- Display a preview.

- Allow image replacement and removal.

- Validate file format and size.

- Handle unsupported and corrupted images.



B. Capture using camera



- Request camera permission only after the user chooses camera capture.

- Open the device camera through the appropriate platform API.

- Support image capture and preview.

- Allow retaking the photograph.

- Explain permission denial and offer an alternative upload method.



C. Upload multiple images



Support multiple-image processing for users who have several receipts or payment confirmations.



Each image must be processed independently and linked to its own extraction result.



Do not combine different receipts into one transaction unless the user explicitly chooses to combine them.



3. DOCUMENT CLASSIFICATION ENGINE



Before extracting transaction fields, classify the document.



Use the following document types:



Document type| Expected interpretation

UPI payment screenshot| Payment confirmation

Bank debit screenshot| Outgoing transaction

Bank credit screenshot| Incoming transaction

Retail receipt| Purchase details

Restaurant receipt| Food purchase

Grocery receipt| Itemised purchase

Online invoice| Purchase or order document

Utility bill| Bill or payment evidence

Refund confirmation| Refund

Failed payment screenshot| Failed transaction

Pending payment screenshot| Pending transaction

Unknown financial document| Requires review



Return:



- Document type

- Classification confidence

- Detected language, if supported

- Whether it appears to contain a completed transaction

- Whether additional review is required



If classification is uncertain, show the user the original document and ask them to select the correct document type.



4. OCR AND INFORMATION EXTRACTION



Implement a modular OCR and document-understanding pipeline.



The OCR provider must be selected based on compatibility with the existing application and deployment environment.



Do not assume that an AI model automatically has access to uploaded files. Implement actual image transfer, processing, response parsing and error handling.



The extraction engine must return structured data.



A. Common transaction fields



Extract the following where available:



- Merchant or recipient name

- Transaction amount

- Currency

- Transaction date

- Transaction time

- Transaction status

- Transaction reference number

- Payment method

- Transaction description

- Sender or payer name, if relevant

- Bank or provider name

- Invoice or receipt number

- Tax information



For Indian users, support:



- Indian Rupees (₹)

- Amounts formatted with Indian digit grouping

- Common Indian date formats

- Common UPI reference terminology

- Common GST terminology



Do not assume that every image contains all these fields.



B. UPI and payment screenshot extraction



Identify:



- Amount paid or received

- Payment status

- Payee or payer

- UPI ID, only if visible and necessary

- UPI transaction reference number

- Date and time

- Payment application name

- Bank name, if displayed

- Transaction description



Determine the direction of the transaction.



Examples:



- Money sent to a merchant → Expense.

- Money received from another person → Income, subject to user confirmation of its meaning.

- Money moved between the user's own accounts → Transfer, if established.

- Failed payment → Not a completed expense.

- Pending payment → Pending, not a confirmed expense.



Do not treat a screenshot's visual design or green success icon alone as definitive proof. Extract the actual status text and show uncertainty where evidence is incomplete.



C. Receipt and invoice extraction



Extract:



- Merchant name

- Merchant address

- Receipt number

- Purchase date

- Purchase time

- Item description

- Item quantity

- Unit price

- Item total

- Subtotal

- Discount

- GST rate

- GST amount

- Other taxes or charges

- Delivery fee

- Packaging fee

- Final invoice total

- Amount actually paid, if shown

- Payment method, if shown



Preserve the original item descriptions.



Do not merge separate line items merely because they have similar names.



D. Item-level extraction



For each item, return:



- Item ID

- Original item name

- Normalised item name, if confidently identified

- Quantity

- Unit price

- Line total

- Suggested category

- Extraction confidence

- Review status



Example:



A grocery receipt could contain:



- Rice — ₹120

- Milk — ₹60

- Soap — ₹45

- Bread — ₹40



SMARTFIN should preserve these individual records rather than only storing the final ₹265 total.



The parent transaction must still be recorded correctly as one purchase.



Do not count each item as an independent payment in the overall financial dashboard.



5. FINANCIAL INTERPRETATION ENGINE



After OCR extraction, run a separate financial interpretation stage.



This stage must determine what the document represents.



Use these transaction states:



- Completed expense

- Completed income

- Refund

- Transfer

- Pending payment

- Failed payment

- Unpaid invoice

- Unknown / requires review



Important distinctions:



Receipt versus payment

An invoice is not automatically proof of payment.



Billed amount versus paid amount

Store them separately when both are available.



Refund versus income

A refund must not be classified as ordinary income.



Transfer versus expense

Moving money between a user's own accounts must not increase expenses.



Failed versus completed

Failed transactions must not enter completed spending totals.



If the system cannot confidently identify the transaction direction or status, require user confirmation.



6. CATEGORY INTELLIGENCE



Implement a category suggestion engine that uses:



- Merchant name

- Item descriptions

- Transaction narration

- Document type

- Previously confirmed user categorisation rules



Use SMARTFIN's existing category structure wherever available.



Examples:



- Groceries → Groceries

- Milk, bread and household essentials → Groceries / Household

- Swiggy and Zomato → Food

- Amazon and Flipkart → Shopping

- Uber and Ola → Transport

- Electricity bills → Utilities

- Pharmacy purchases → Healthcare

- College fees → Education

- Netflix and Spotify → Subscriptions



For mixed receipts, categorise individual items where supported.



Do not automatically categorise uncertain records as though the classification were certain.



Allow the user to:



- Accept a category suggestion.

- Change a category.

- Create a categorisation rule.

- Apply a rule to future matching transactions.



7. EXTRACTION CONFIDENCE AND VALIDATION



Every extracted field must have an extraction status.



Use:



- High confidence

- Medium confidence

- Low confidence

- Not detected



Where the OCR provider supports numeric confidence scores, retain those scores internally and map them to understandable labels.



Do not display misleading precision.



Implement validation rules:



Amount validation



- Check whether item totals approximately match the subtotal.

- Check whether subtotal, tax, discounts and charges reconcile with the final bill.

- Account for rounding differences.

- Do not change extracted values just to force a mathematical match.



Date validation



- Detect ambiguous date formats.

- Avoid silently interpreting an ambiguous date incorrectly.

- Flag missing or invalid dates.



Reference validation



- Preserve the original transaction reference.

- Check whether it already exists in SMARTFIN.



Merchant validation



- Preserve the original extracted merchant name.

- Store a normalised merchant name separately when possible.



If a validation fails, show a warning and allow correction.



8. REVIEW SCREEN



After processing, display a dedicated extraction-review screen.



The layout should include:



Section 1: Original image



- Image preview

- Zoom support

- Replace image

- Remove image



Section 2: Document identification



- Document type

- Classification confidence

- Transaction status



Section 3: Transaction information



- Merchant

- Amount

- Date

- Time

- Transaction type

- Category

- Payment method

- Reference ID



Section 4: Itemised information



- Item names

- Quantities

- Unit prices

- Line totals

- Suggested categories



Section 5: Validation



- Total reconciliation

- Missing information

- Potential duplicate warning

- Uncertain extracted fields



All editable fields must use the existing SMARTFIN design system.



Provide three actions:



1. Confirm and Save

2. Edit Information

3. Discard



Never save an uncertain extraction as a confirmed transaction without user approval.



9. DATABASE DESIGN AND INTEGRATION



Inspect the existing database schema before introducing new tables.



Reuse the existing transaction entity and category model.



If the existing schema does not support image extraction, introduce compatible records for:



Extraction record



- extraction_id

- user_id

- document_type

- processing_status

- original_file_reference

- OCR_provider

- extracted_payload

- confidence_metadata

- validation_results

- created_at

- updated_at



Receipt item records



- item_id

- extraction_id

- transaction_id

- original_name

- normalised_name

- quantity

- unit_price

- line_total

- category_id

- confidence

- review_status



Transaction source metadata



- source_type = image_extraction

- extraction_id

- original_reference_id

- confirmation_status



Use appropriate user-level access controls.



Do not store image contents directly in ordinary transaction records.



Keep file storage private. Define retention and deletion behaviour. Do not publicly expose receipt URLs.



10. DUPLICATE DETECTION



Check the extraction against existing records before saving.



Use:



- Provider reference number

- Receipt number

- Merchant

- Date

- Amount

- Description



Prioritise exact reference matches when available.



If no unique reference exists, use a combination of available fields to identify possible duplicates.



Show:

"This transaction may already exist in SMARTFIN."



Allow the user to:



- Open the existing transaction.

- Save anyway.

- Cancel the import.



Never silently delete or merge records based on uncertain similarity.



11. END-TO-END DATA FLOW



Implement this exact workflow:



Image Selection

→ File Validation

→ Secure Image Handling

→ Document Classification

→ OCR

→ Structured Field Extraction

→ Financial Interpretation

→ Category Suggestions

→ Mathematical Validation

→ Duplicate Detection

→ User Review

→ User Confirmation

→ Transaction Creation

→ Dashboard and Analytics Refresh



Each stage must have a clear processing state and recoverable error handling.



Do not create a transaction if processing fails or the user has not confirmed it.



12. ERROR HANDLING



Handle:



- Unsupported image format

- Corrupted image

- Poor image quality

- OCR service unavailable

- OCR timeout

- No readable text

- Unrecognised document

- Missing amount

- Ambiguous transaction status

- Invalid date

- Conflicting totals

- Duplicate candidate

- Database save failure

- User cancellation



Preserve the original image temporarily where appropriate so that the user can retry.



Do not show a false success message.



13. PRIVACY AND SECURITY



- Request camera or gallery permissions only when needed.

- Use secure transport.

- Never log raw financial document content unnecessarily.

- Do not expose OCR provider credentials in frontend code.

- Obtain consent before sending images to a third-party OCR or AI service.

- Minimise image retention.

- Provide a clear deletion process.

- Never extract or store UPI PINs, OTPs, passwords or card security codes.

- Do not use financial images for model training without a separate valid consent process.



14. TESTING AND ACCEPTANCE CRITERIA



Create tests for:



- UPI successful payment

- UPI failed payment

- UPI pending payment

- Bank debit

- Bank credit

- Refund

- Transfer

- Paid receipt

- Unpaid invoice

- Multi-item grocery receipt

- GST calculation

- Discount calculation

- Poor-quality image

- Missing amount

- Duplicate transaction

- Incorrect extraction

- Database failure



Test with fictional or properly anonymised sample documents.



The feature is complete only when:



- Real images can be uploaded or captured.

- Actual OCR processing occurs.

- Structured information is extracted.

- Transaction status is interpreted.

- Item-level information is preserved.

- The user can correct the extracted information.

- Duplicates are flagged.

- Confirmed transactions are saved.

- All relevant financial screens update correctly.



15. IMPLEMENTATION INSTRUCTIONS



Before coding:



1. Inspect the current SMARTFIN project.

2. Identify the framework and whether it supports web, Android or both.

3. Inspect the existing transaction schema.

4. Identify existing upload and storage capabilities.

5. Identify existing OCR or AI integrations.

6. Produce a concise implementation plan.



Then implement this feature in small, testable stages.



Do not rewrite unrelated screens.

Do not replace the current architecture.

Do not create hardcoded OCR results.

Do not claim OCR works unless it has been tested with actual images.



At completion, report:



- Files created and modified

- Services and dependencies added

- Database changes

- Environment variables required

- Actual OCR provider used

- Tests performed

- Known limitations

- Remaining work

Build this in my existing application

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/dac84116-0e23-4549-8d23-5ca004bb296c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
