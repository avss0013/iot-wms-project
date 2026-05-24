import requests
import time

BASE = 'http://127.0.0.1:5000'


def create_item_no_qr():
    print('Creating item without QR payload...')
    r = requests.post(BASE + '/api/items', json={'description': 'Test generated item', 'location_id': 1, 'quantity': 3})
    print('Status:', r.status_code, r.json())
    return r.json()


def get_qr_image(qr_code):
    print('Fetching QR image...')
    r = requests.get(BASE + f'/qrcodes/{qr_code}.png')
    print('Status:', r.status_code)
    if r.status_code == 200:
        with open('tmp_qr.png', 'wb') as f:
            f.write(r.content)
        print('Saved tmp_qr.png')


if __name__ == '__main__':
    res = create_item_no_qr()
    # Expect message includes item_id and created qr stored on server
    time.sleep(0.5)
    # Attempt to fetch the png if qr_code value returned
    # The server currently does not return the qr_code value; so user can check qrcodes folder.
    print('Test client done')
