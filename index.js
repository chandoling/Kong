/*최종적으로 쓰일 코드
eoa_sepolia.txt랑
privatekey_sepolia_test.txt랑
all_hexdata_output.txt랑
erc20_amount_test.txt랑
decimal 바꾸면 됨. 6->18

senderprivatekey랑
token address랑
destinationAddress 받는 사람이랑
contractAddress 클레임 주소랑
gwei랑 gwei 계산
*/



const Web3 = require('web3');
const fs = require('fs');

// Initialize Web3 with the appropriate RPC URL
const web3 = new Web3('https://scroll.blockpi.network/v1/rpc/a3836ce6936607f31680db4924e543ba2abaf0d5'); // Replace with your updated RPC URL

// Sender's private key (the wallet sending ETH to recipients)
const senderPrivateKey = ''; // 0xFc8F295801a08367DA58eF0Cb1532a144fC75560 프라이빗 키
const senderAccount = web3.eth.accounts.privateKeyToAccount(senderPrivateKey);
web3.eth.accounts.wallet.add(senderAccount);

// Files containing recipient addresses and corresponding private keys
const recipientAddressesFile = 'EOA.txt';
const recipientPrivateKeysFile = 'privatekey.txt';

// Files containing hex data and ERC-20 amounts
const hexDataFile = 'all_hexdata.txt';       // 진짜로 바꿔야됨
const erc20AmountsFile = 'erc20_amount.txt';   // 진짜로 바꿔야됨 

// Read recipient addresses
const recipients = fs
  .readFileSync(recipientAddressesFile, 'utf-8')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

// Read recipient private keys
const recipientPrivateKeys = fs
  .readFileSync(recipientPrivateKeysFile, 'utf-8')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

// Read hex data for contract interactions
const hexDataList = fs
  .readFileSync(hexDataFile, 'utf-8')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

// Read ERC-20 amounts
const erc20Amounts = fs
  .readFileSync(erc20AmountsFile, 'utf-8')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

// Ensure that all arrays have the same length
const totalEntries = Math.min(
  recipients.length,
  recipientPrivateKeys.length,
  hexDataList.length,
  erc20Amounts.length,
  100 // Limit to 100 iterations as per your request
);

// ERC-20 Token contract address and ABI
const tokenAddress = '0xd29687c813D741E2F938F4aC377128810E217b1b';
const tokenABI = [
  // balanceOf(address)
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function',
  },
  // transfer(address, uint256)
  {
    constant: false,
    inputs: [
      { name: '_to', type: 'address' },
      { name: '_value', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: 'success', type: 'bool' }],
    type: 'function',
  },
];
const tokenContract = new web3.eth.Contract(tokenABI, tokenAddress);

// Destination address for ERC-20 token transfer
const destinationAddress = '0xFc8F295801a08367DA58eF0Cb1532a144fC75560';

// Contract address for interaction
const contractAddress = ''; //클레임 컨트렉트

// Gas price and amount to send (ensure it's enough to cover gas costs)
const gasPrice = web3.utils.toWei('1', 'gwei'); // Adjust as needed
const amountToSend = web3.utils.toWei('0.0002', 'ether'); // Ensure this covers gas costs for recipient

// Helper function to wait for a specified amount of time
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Main function to process all recipients
async function main() {
  for (let index = 0; index < totalEntries; index++) {
    const recipientAddress = recipients[index];
    const recipientPrivateKey = recipientPrivateKeys[index];
    const hexData = hexDataList[index];
    const erc20Amount = erc20Amounts[index];

    console.log(`Processing recipient ${index + 1}: ${recipientAddress}`);

    // Step 1: Send ETH to the recipient from the sender's wallet
    let txHash;
    try {
      const txCount = await web3.eth.getTransactionCount(senderAccount.address, 'pending');
      const tx = {
        from: senderAccount.address,
        to: recipientAddress,
        value: amountToSend,
        gas: 21000,
        gasPrice: gasPrice,
        nonce: txCount,
      };

      const signedTx = await web3.eth.accounts.signTransaction(tx, senderPrivateKey);
      const sendTxPromise = web3.eth.sendSignedTransaction(signedTx.rawTransaction);

      // Get transaction hash immediately
      sendTxPromise.on('transactionHash', (hash) => {
        txHash = hash;
        console.log(`ETH sent to ${recipientAddress}. Transaction Hash: ${hash}`);
      });


      const receipt = await Promise.race([
        sendTxPromise,
        delay(3000).then(() => null), // Timeout after 60 seconds
      ]);

      if (receipt && receipt.transactionHash) {
        console.log(`ETH transfer to ${recipientAddress} confirmed.`);
      } else {
        console.log(`ETH transfer to ${recipientAddress} not confirmed after timeout.`);
      }
    } catch (error) {
      console.error(`Error sending ETH to ${recipientAddress}: ${error.message || error}`);
      // Proceed to Step 2 regardless
    }

    // Proceed to Step 2 after waiting for confirmation or timeout
    try {
      await sendTransactionSet(recipientPrivateKey, hexData, erc20Amount);
    } catch (error) {
      console.error(`Error initiating transactions from ${recipientAddress}: ${error.message || error}`);
      // Continue to next recipient
      continue;
    }

    // Optional: Wait before processing the next recipient
      await delay(2000); // You can uncomment this line if you want a delay between iterations
  }

  console.log('All transactions have been initiated.');
}

// Function to send contract interaction and ERC-20 transfer from recipient's account
async function sendTransactionSet(privateKey, hexData, erc20Amount) {
  if (!privateKey || !hexData || !erc20Amount) {
    console.error(
      `Missing values: privateKey=${privateKey}, hexData=${hexData}, erc20Amount=${erc20Amount}`
    );
    return; // Skip if any value is missing
  }

  const account = web3.eth.accounts.privateKeyToAccount(privateKey);
  web3.eth.accounts.wallet.add(account);

  try {
    const txCount = await web3.eth.getTransactionCount(account.address, 'pending');

    // Contract interaction transaction
    const contractTx = {
      from: account.address,
      to: contractAddress,
      gas: 500000, // Adjust gas limit as needed
      gasPrice: gasPrice,
      data: hexData,
      nonce: txCount,
    };

    // Convert ERC-20 amount to smallest unit (assuming 6 decimals)
    let erc20AmountInSmallestUnit;
    if (erc20Amount.includes('.')) {
      erc20AmountInSmallestUnit = (
        parseFloat(erc20Amount) *
        Math.pow(10, 18)
      ).toString();
    } else {
      erc20AmountInSmallestUnit = erc20Amount; // Use as is if already in smallest unit
    }

    // ERC-20 transfer transaction
    const erc20Tx = {
      from: account.address,
      to: tokenAddress,
      gas: 100000, // Adjust gas limit as needed
      gasPrice: gasPrice,
      data: tokenContract.methods
        .transfer(destinationAddress, erc20AmountInSmallestUnit)
        .encodeABI(),
      nonce: txCount + 1,
    };

    // Sign transactions
    const signedContractTx = await web3.eth.accounts.signTransaction(
      contractTx,
      privateKey
    );
    const signedErc20Tx = await web3.eth.accounts.signTransaction(
      erc20Tx,
      privateKey
    );

    // Send transactions
    web3.eth.sendSignedTransaction(signedContractTx.rawTransaction)
      .on('transactionHash', (hash) => {
        console.log(`Contract interaction from ${account.address}. Tx Hash: ${hash}`);
      })
      .on('error', (error) => {
        console.error(`Error sending contract interaction from ${account.address}: ${error.message || error}`);
      });

    web3.eth.sendSignedTransaction(signedErc20Tx.rawTransaction)
      .on('transactionHash', (hash) => {
        console.log(`ERC-20 transfer from ${account.address}. Tx Hash: ${hash}`);
      })
      .on('error', (error) => {
        console.error(`Error sending ERC-20 transfer from ${account.address}: ${error.message || error}`);
      });

  } catch (err) {
    console.error(`Error sending transactions from ${account.address}: ${err.message || err}`);
    // Continue to next recipient
  }
}

// Start the main function
main().catch((error) => {
  console.error(`An error occurred in the main function: ${error.message || error}`);
});
