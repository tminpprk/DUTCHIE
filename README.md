This is a web application built with Next.js and TypeScript to help groups split travel expenses fairly.

live demo at: https://dutchie-505375468841.asia-northeast3.run.app/

Prototype at: https://docs.google.com/presentation/d/1lBoc5AYGI8r5uN91CG3Umajn36QXNOVDilZIWVDKwnA/edit?usp=sharing

Features

- Add people involved in the trip or group expense.

- Upload receipt images. Uses Google Cloud Vision API to extract prices. Each receipt is grouped as `r1`, `r2`, and the name can be changed any time. 
s
- Manual items are split equally among all participants. Receipt items can be assigned to specific people. Supports multiple receipts paid by different cards

- Optimizes transactions to minimize the number of payments. Shows who should send money to whom and how much

- "How did it work?" pages represents additional explaination through chart, presenting three charts in total: what each person paid, raw (non-optimmized) money transfer, optimized transfer results.